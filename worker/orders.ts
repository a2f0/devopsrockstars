import type {
  StoreOrderResponse,
  StoreOrderStatus,
} from '../src/store/contracts';
import {constantTimeEqual, sha256} from './crypto';
import type {Env} from './types';

interface OrderRow {
  readonly access_token_hash: string;
  readonly currency: string;
  readonly id: string;
  readonly reservation_expires_at: string;
  readonly status: StoreOrderStatus;
  readonly total_amount: number;
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
  return {
    orderId: order.id,
    status: order.status,
    currency: order.currency,
    expiresAt: order.reservation_expires_at,
    totalAmount: order.total_amount,
  };
}
