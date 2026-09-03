import type {
  StoreOrderResponse,
  StoreOrderStatus,
} from '../src/store/contracts';
import {constantTimeEqual, sha256} from './crypto';
import {cancelPaymentIntent, StripeRequestError} from './stripe';
import type {Env} from './types';

interface OrderRow {
  readonly access_token_hash: string;
  readonly currency: string;
  readonly id: string;
  readonly reservation_expires_at: string;
  readonly status: StoreOrderStatus;
  readonly total_amount: number;
}

interface CancelableOrderRow extends OrderRow {
  readonly stripe_payment_intent_id: string | null;
}

export class OrderCancellationError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'OrderCancellationError';
    this.code = code;
    this.status = status;
  }
}

function response(order: OrderRow): StoreOrderResponse {
  return {
    orderId: order.id,
    status: order.status,
    currency: order.currency,
    expiresAt: order.reservation_expires_at,
    totalAmount: order.total_amount,
  };
}

export async function loadOrder(
  env: Env,
  orderId: string,
  token: string
): Promise<StoreOrderResponse | null> {
  if (!/^[0-9a-f-]{36}$/iu.test(orderId) || token.length > 100) return null;
  const order = await env.DB.prepare(
    `SELECT id, access_token_hash, status, currency, total_amount,
            reservation_expires_at
     FROM orders
     WHERE id = ?`
  )
    .bind(orderId)
    .first<OrderRow>();
  if (!order) return null;
  const tokenHash = await sha256(token);
  if (!constantTimeEqual(order.access_token_hash, tokenHash)) return null;
  return response(order);
}

export async function cancelOrder(
  env: Env,
  orderId: string,
  token: string,
  cancelIntent: typeof cancelPaymentIntent = cancelPaymentIntent
): Promise<StoreOrderResponse | null> {
  if (!/^[0-9a-f-]{36}$/iu.test(orderId) || token.length > 100) return null;
  const order = await env.DB.prepare(
    `SELECT id, access_token_hash, status, currency, total_amount,
            reservation_expires_at, stripe_payment_intent_id
     FROM orders
     WHERE id = ?`
  )
    .bind(orderId)
    .first<CancelableOrderRow>();
  if (!order) return null;
  const tokenHash = await sha256(token);
  if (!constantTimeEqual(order.access_token_hash, tokenHash)) return null;
  if (order.status === 'canceled') return response(order);
  if (order.status === 'paid') {
    throw new OrderCancellationError(
      'order_already_paid',
      'A paid order cannot be canceled here.',
      409
    );
  }
  if (order.stripe_payment_intent_id) {
    const secretKey = env.STRIPE_SECRET_KEY?.trim();
    if (!secretKey) {
      throw new OrderCancellationError(
        'checkout_unavailable',
        'Checkout cancellation is temporarily unavailable.',
        503
      );
    }
    try {
      if (!(await cancelIntent(secretKey, order.stripe_payment_intent_id))) {
        throw new OrderCancellationError(
          'payment_processing',
          'The payment is already processing and cannot be canceled here.',
          409
        );
      }
    } catch (error) {
      if (error instanceof OrderCancellationError) throw error;
      if (error instanceof StripeRequestError) {
        throw new OrderCancellationError(
          'payment_provider_unavailable',
          'The payment provider could not cancel this checkout.',
          502
        );
      }
      throw error;
    }
  }
  const now = new Date().toISOString();
  const updated = await env.DB.prepare(
    `UPDATE orders
     SET status = 'canceled', canceled_at = ?, updated_at = ?
     WHERE id = ? AND status IN ('creating_payment', 'awaiting_payment')`
  )
    .bind(now, now, order.id)
    .run();
  if (updated.meta.changes !== 1) {
    const current = await loadOrder(env, orderId, token);
    if (current?.status === 'canceled') return current;
    throw new OrderCancellationError(
      'order_changed',
      'The order changed while it was being canceled.',
      409
    );
  }
  return response({...order, status: 'canceled'});
}
