import type {ShippingInput} from '@devopsrockstars/store-contracts';

const STRIPE_ORIGIN = 'https://api.stripe.com';
const STRIPE_API_VERSION = '2026-02-25.clover';
const REQUEST_TIMEOUT_MS = 10_000;

export class StripeRequestError extends Error {
  readonly status: number;

  constructor(operation: string, status: number) {
    super(`Stripe ${operation} failed with status ${status}.`);
    this.name = 'StripeRequestError';
    this.status = status;
  }
}

interface PaymentIntentInput {
  readonly amount: number;
  readonly currency: string;
  readonly orderId: string;
  readonly secretKey: string;
  readonly shipping: ShippingInput;
}

interface PaymentIntentResult {
  readonly clientSecret: string;
  readonly id: string;
}

interface PaymentIntentState {
  readonly amountReceived: number | null;
  readonly currency: string | null;
  readonly id: string;
  readonly orderId: string | null;
  readonly source: string | null;
  readonly status: string;
}

function property(value: unknown, key: string) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return Reflect.get(value, key) as unknown;
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value) {
    throw new StripeRequestError(`response missing ${field}`, 502);
  }
  return value;
}

async function requestStripe(input: {
  readonly form?: URLSearchParams;
  readonly idempotencyKey?: string;
  readonly method?: 'GET' | 'POST';
  readonly operation: string;
  readonly path: string;
  readonly secretKey: string;
}) {
  let response: Response;
  try {
    response = await fetch(`${STRIPE_ORIGIN}${input.path}`, {
      method: input.method ?? 'POST',
      headers: {
        Authorization: `Bearer ${input.secretKey}`,
        'Stripe-Version': STRIPE_API_VERSION,
        ...(input.form
          ? {'Content-Type': 'application/x-www-form-urlencoded'}
          : {}),
        ...(input.idempotencyKey
          ? {'Idempotency-Key': input.idempotencyKey}
          : {}),
      },
      ...(input.form ? {body: input.form.toString()} : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    console.error(`Stripe ${input.operation} transport failure:`, error);
    throw new StripeRequestError(input.operation, 0);
  }
  if (!response.ok) {
    let responseBody: unknown = null;
    try {
      responseBody = await response.json();
    } catch {
      // Stripe can return a non-JSON gateway response.
    }
    const stripeError = property(responseBody, 'error');
    console.error(`Stripe ${input.operation} failed:`, {
      code: property(stripeError, 'code'),
      status: response.status,
      type: property(stripeError, 'type'),
    });
    throw new StripeRequestError(input.operation, response.status);
  }
  return response.json() as Promise<unknown>;
}

export async function retrievePaymentIntent(
  secretKey: string,
  intentId: string
): Promise<PaymentIntentState> {
  if (!/^pi_[A-Za-z0-9_]+$/u.test(intentId)) {
    throw new StripeRequestError('PaymentIntent retrieval', 400);
  }
  const result = await requestStripe({
    method: 'GET',
    operation: 'PaymentIntent retrieval',
    path: `/v1/payment_intents/${encodeURIComponent(intentId)}`,
    secretKey,
  });
  const metadata = property(result, 'metadata');
  const amountReceived = property(result, 'amount_received');
  const currency = property(result, 'currency');
  const orderId = property(metadata, 'order_id');
  const source = property(metadata, 'source');
  return {
    amountReceived: typeof amountReceived === 'number' ? amountReceived : null,
    currency: typeof currency === 'string' ? currency : null,
    id: requiredString(property(result, 'id'), 'id'),
    orderId: typeof orderId === 'string' ? orderId : null,
    source: typeof source === 'string' ? source : null,
    status: requiredString(property(result, 'status'), 'status'),
  };
}

export async function createPaymentIntent(
  input: PaymentIntentInput
): Promise<PaymentIntentResult> {
  const form = new URLSearchParams();
  form.set('amount', String(input.amount));
  form.set('currency', input.currency);
  form.append('payment_method_types[]', 'card');
  form.set('description', 'DevOps Rockstars store order');
  form.set('receipt_email', input.shipping.email);
  form.set('metadata[order_id]', input.orderId);
  form.set('metadata[source]', 'devopsrockstars_store');
  form.set('shipping[name]', input.shipping.name);
  form.set('shipping[address][line1]', input.shipping.addressLine1);
  if (input.shipping.addressLine2) {
    form.set('shipping[address][line2]', input.shipping.addressLine2);
  }
  form.set('shipping[address][city]', input.shipping.city);
  form.set('shipping[address][state]', input.shipping.state);
  form.set('shipping[address][postal_code]', input.shipping.postalCode);
  form.set('shipping[address][country]', input.shipping.country);
  const result = await requestStripe({
    form,
    idempotencyKey: `store-${input.orderId}`,
    operation: 'PaymentIntent creation',
    path: '/v1/payment_intents',
    secretKey: input.secretKey,
  });
  return {
    id: requiredString(property(result, 'id'), 'id'),
    clientSecret: requiredString(
      property(result, 'client_secret'),
      'client_secret'
    ),
  };
}

export async function cancelPaymentIntent(
  secretKey: string,
  intentId: string,
  attemptId = crypto.randomUUID()
) {
  if (!/^pi_[A-Za-z0-9_]+$/u.test(intentId)) {
    throw new StripeRequestError('PaymentIntent cancellation', 400);
  }
  const result = await requestStripe({
    form: new URLSearchParams(),
    idempotencyKey: `cancel-${intentId}-${attemptId}`,
    operation: 'PaymentIntent cancellation',
    path: `/v1/payment_intents/${encodeURIComponent(intentId)}/cancel`,
    secretKey,
  });
  return property(result, 'status') === 'canceled';
}
