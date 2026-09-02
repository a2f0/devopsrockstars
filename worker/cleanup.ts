import {cancelPaymentIntent} from './stripe';
import type {Env} from './types';

interface ExpiredOrderRow {
  readonly id: string;
  readonly stripe_payment_intent_id: string | null;
}

async function markCanceled(env: Env, orderId: string, now: string) {
  await env.DB.prepare(
    `UPDATE orders
     SET status = 'canceled', canceled_at = ?, updated_at = ?
     WHERE id = ? AND status IN ('creating_payment', 'awaiting_payment')`
  )
    .bind(now, now, orderId)
    .run();
}

export async function cleanupExpiredOrders(env: Env, scheduledTime: number) {
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    console.error('Expired orders cannot be cleaned up without Stripe.');
    return;
  }
  const now = new Date(scheduledTime).toISOString();
  const expired = await env.DB.prepare(
    `SELECT id, stripe_payment_intent_id
     FROM orders
     WHERE status IN ('creating_payment', 'awaiting_payment')
       AND reservation_expires_at <= ?
     ORDER BY reservation_expires_at
     LIMIT 25`
  )
    .bind(now)
    .all<ExpiredOrderRow>();

  for (const order of expired.results) {
    try {
      if (
        order.stripe_payment_intent_id &&
        !(await cancelPaymentIntent(secretKey, order.stripe_payment_intent_id))
      ) {
        continue;
      }
      await markCanceled(env, order.id, now);
    } catch (error) {
      console.error(`Failed to expire order ${order.id}:`, error);
    }
  }
}
