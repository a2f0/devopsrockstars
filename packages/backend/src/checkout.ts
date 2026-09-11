import type {
  CreateCheckoutRequest,
  CreateCheckoutResponse,
} from '@devopsrockstars/shared-types';
import {randomToken, sha256} from './crypto';
import {
  cancelPaymentIntent,
  createPaymentIntent,
  StripeRequestError,
} from './stripe';
import type {D1PreparedStatement, Env} from './types';

const RESERVATION_MINUTES = 10;

export interface CheckoutDependencies {
  readonly cancelPaymentIntent: typeof cancelPaymentIntent;
  readonly createPaymentIntent: typeof createPaymentIntent;
  readonly now: () => Date;
  readonly randomToken: typeof randomToken;
  readonly randomUUID: () => string;
  readonly sha256: typeof sha256;
}

const defaultDependencies: CheckoutDependencies = {
  cancelPaymentIntent,
  createPaymentIntent,
  now: () => new Date(),
  randomToken,
  randomUUID: () => crypto.randomUUID(),
  sha256,
};

interface VariantRow {
  readonly active: number;
  readonly currency: string;
  readonly inventory_quantity: number;
  readonly label: string;
  readonly product_active: number;
  readonly product_id: string;
  readonly product_name: string;
  readonly sku: string;
  readonly unit_amount: number;
  readonly variant_id: string;
}

export class CheckoutCreationError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'CheckoutCreationError';
    this.code = code;
    this.status = status;
  }
}

async function loadVariants(env: Env, ids: readonly string[]) {
  const placeholders = ids.map(() => '?').join(', ');
  const result = await env.DB.prepare(
    `SELECT
       v.id AS variant_id,
       v.product_id,
       v.sku,
       v.label,
       v.unit_amount,
       v.currency,
       v.inventory_quantity,
       v.active,
       p.name AS product_name,
       p.active AS product_active
     FROM product_variants v
     INNER JOIN products p ON p.id = v.product_id
     WHERE v.id IN (${placeholders})`
  )
    .bind(...ids)
    .all<VariantRow>();
  return new Map(result.results.map(row => [row.variant_id, row]));
}

function calculateOrder(
  request: CreateCheckoutRequest,
  variants: ReadonlyMap<string, VariantRow>
) {
  let currency: string | null = null;
  let totalAmount = 0;
  const lines: Array<
    CreateCheckoutRequest['items'][number] & {
      readonly variant: VariantRow;
      readonly lineTotal: number;
    }
  > = [];
  for (const item of request.items) {
    const variant = variants.get(item.variantId);
    if (!variant?.active || !variant.product_active) {
      throw new CheckoutCreationError(
        'item_unavailable',
        'An item in your cart is no longer available.',
        409
      );
    }
    if (variant.inventory_quantity < item.quantity) {
      throw new CheckoutCreationError(
        'out_of_stock',
        `${variant.label} is out of stock.`,
        409
      );
    }
    if (currency && currency !== variant.currency) {
      throw new CheckoutCreationError(
        'mixed_currency',
        'Items with different currencies cannot share an order.',
        409
      );
    }
    currency = variant.currency;
    const lineTotal = variant.unit_amount * item.quantity;
    totalAmount += lineTotal;
    lines.push({...item, variant, lineTotal});
  }
  if (
    !currency ||
    !Number.isSafeInteger(totalAmount) ||
    totalAmount < 50 ||
    totalAmount > 99_999_999
  ) {
    throw new CheckoutCreationError(
      'invalid_total',
      'The order total is invalid.',
      409
    );
  }
  return {currency, totalAmount, lines};
}

async function cancelOrder(
  env: Env,
  orderId: string,
  now: string,
  paymentIntentId: string | null = null,
  paymentCancellationFailed = false
) {
  await env.DB.prepare(
    `UPDATE orders
     SET status = 'canceled',
         stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, ?),
         payment_cancel_failed_at = CASE WHEN ? = 1 THEN ? ELSE payment_cancel_failed_at END,
         canceled_at = ?, updated_at = ?
     WHERE id = ? AND status IN ('creating_payment', 'awaiting_payment')`
  )
    .bind(
      paymentIntentId,
      paymentCancellationFailed ? 1 : 0,
      now,
      now,
      now,
      orderId
    )
    .run();
}

export function reservationStatements(input: {
  readonly accessTokenHash: string;
  readonly clientHash: string;
  readonly networkHash: string;
  readonly currency: string;
  readonly expiresAt: string;
  readonly lines: ReturnType<typeof calculateOrder>['lines'];
  readonly now: string;
  readonly orderId: string;
  readonly request: CreateCheckoutRequest;
  readonly totalAmount: number;
  readonly env: Env;
}): readonly D1PreparedStatement[] {
  const {shipping} = input.request;
  const statements: D1PreparedStatement[] = [
    input.env.DB.prepare(
      `INSERT INTO orders (
         id, access_token_hash, checkout_client_hash, checkout_network_hash,
         status, currency, subtotal_amount,
         shipping_amount, total_amount, email, shipping_name,
         shipping_address_line1, shipping_address_line2, shipping_city,
         shipping_state, shipping_postal_code, shipping_country,
         reservation_expires_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'creating_payment', ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      input.orderId,
      input.accessTokenHash,
      input.clientHash,
      input.networkHash,
      input.currency,
      input.totalAmount,
      input.totalAmount,
      shipping.email,
      shipping.name,
      shipping.addressLine1,
      shipping.addressLine2,
      shipping.city,
      shipping.state,
      shipping.postalCode,
      shipping.country,
      input.expiresAt,
      input.now,
      input.now
    ),
  ];
  for (const line of input.lines) {
    statements.push(
      input.env.DB.prepare(
        `INSERT INTO order_items (
           order_id, variant_id, product_id, sku, product_name,
           variant_label, unit_amount, quantity, line_total
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        input.orderId,
        line.variantId,
        line.variant.product_id,
        line.variant.sku,
        line.variant.product_name,
        line.variant.label,
        line.variant.unit_amount,
        line.quantity,
        line.lineTotal
      ),
      input.env.DB.prepare(
        `UPDATE product_variants
         SET inventory_quantity = inventory_quantity - ?, updated_at = ?
         WHERE id = ?`
      ).bind(line.quantity, input.now, line.variantId)
    );
  }
  return statements;
}

export async function startCheckout(
  env: Env,
  request: CreateCheckoutRequest,
  clientHash: string,
  networkHash: string,
  dependencies: CheckoutDependencies = defaultDependencies
): Promise<CreateCheckoutResponse> {
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  const publishableKey = env.STRIPE_PUBLISHABLE_KEY?.trim();
  if (!secretKey || !publishableKey) {
    throw new CheckoutCreationError(
      'checkout_unavailable',
      'Checkout is not configured yet.',
      503
    );
  }
  const variants = await loadVariants(
    env,
    request.items.map(item => item.variantId)
  );
  const order = calculateOrder(request, variants);
  const orderId = dependencies.randomUUID();
  const orderToken = dependencies.randomToken();
  const accessTokenHash = await dependencies.sha256(orderToken);
  const now = dependencies.now();
  const expiresAt = new Date(
    now.getTime() + RESERVATION_MINUTES * 60_000
  ).toISOString();

  try {
    await env.DB.batch(
      reservationStatements({
        accessTokenHash,
        clientHash,
        currency: order.currency,
        expiresAt,
        lines: order.lines,
        networkHash,
        now: now.toISOString(),
        orderId,
        request,
        totalAmount: order.totalAmount,
        env,
      })
    );
  } catch (error) {
    if (String(error).includes('inventory_below_zero')) {
      throw new CheckoutCreationError(
        'out_of_stock',
        'That size just sold out. Please choose another size.',
        409
      );
    }
    if (String(error).includes('checkout_already_active')) {
      throw new CheckoutCreationError(
        'checkout_already_active',
        'A checkout is already active in this browser.',
        409
      );
    }
    if (String(error).includes('checkout_network_busy')) {
      throw new CheckoutCreationError(
        'checkout_rate_limited',
        'Too many checkouts are already active on this connection.',
        429
      );
    }
    if (String(error).includes('checkout_store_busy')) {
      throw new CheckoutCreationError(
        'checkout_unavailable',
        'The store is busy. Please try again in a few minutes.',
        503
      );
    }
    throw error;
  }

  let paymentIntent: Awaited<ReturnType<typeof createPaymentIntent>>;
  try {
    paymentIntent = await dependencies.createPaymentIntent({
      amount: order.totalAmount,
      currency: order.currency,
      orderId,
      secretKey,
      shipping: request.shipping,
    });
  } catch (error) {
    await cancelOrder(env, orderId, dependencies.now().toISOString());
    if (error instanceof StripeRequestError) {
      throw new CheckoutCreationError(
        'payment_provider_unavailable',
        'The payment provider is temporarily unavailable.',
        502
      );
    }
    throw error;
  }

  try {
    const updated = await env.DB.prepare(
      `UPDATE orders
       SET status = 'awaiting_payment', stripe_payment_intent_id = ?, updated_at = ?
       WHERE id = ? AND status = 'creating_payment'`
    )
      .bind(paymentIntent.id, dependencies.now().toISOString(), orderId)
      .run();
    if (updated.meta.changes !== 1) {
      throw new Error('The reserved order could not be activated.');
    }
  } catch (error) {
    let paymentCancellationFailed = false;
    try {
      await dependencies.cancelPaymentIntent(secretKey, paymentIntent.id);
    } catch (cancelError) {
      paymentCancellationFailed = true;
      console.error('Failed to cancel an orphaned PaymentIntent:', cancelError);
    }
    await cancelOrder(
      env,
      orderId,
      dependencies.now().toISOString(),
      paymentIntent.id,
      paymentCancellationFailed
    );
    throw error;
  }

  return {
    clientSecret: paymentIntent.clientSecret,
    currency: order.currency,
    expiresAt,
    lines: order.lines.map(line => ({
      currency: order.currency,
      productName: line.variant.product_name,
      quantity: line.quantity,
      unitAmount: line.variant.unit_amount,
      variantId: line.variantId,
      variantLabel: line.variant.label,
    })),
    orderId,
    orderToken,
    totalAmount: order.totalAmount,
  };
}
