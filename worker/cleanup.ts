import {cancelPaymentIntent, retrievePaymentIntent} from './stripe';
import type {Env} from './types';

interface ExpiredOrderRow {
  readonly currency: string;
  readonly id: string;
  readonly stripe_payment_intent_id: string | null;
  readonly total_amount: number;
}

interface CleanupDependencies {
  readonly cancelPaymentIntent: typeof cancelPaymentIntent;
  readonly retrievePaymentIntent: typeof retrievePaymentIntent;
}

const defaultDependencies: CleanupDependencies = {
  cancelPaymentIntent,
  retrievePaymentIntent,
};

async function markCanceled(env: Env, orderId: string, now: string) {
  await env.DB.prepare(
    `UPDATE orders
     SET status = 'canceled', canceled_at = ?, updated_at = ?
     WHERE id = ? AND status IN ('creating_payment', 'awaiting_payment')`
  )
    .bind(now, now, orderId)
    .run();
}

async function reconcileUncanceledPayment(
  env: Env,
  order: ExpiredOrderRow,
  secretKey: string,
  now: string,
  dependencies: CleanupDependencies
) {
  if (!order.stripe_payment_intent_id) return false;
  const payment = await dependencies.retrievePaymentIntent(
    secretKey,
    order.stripe_payment_intent_id
  );
  if (payment.status === 'canceled') {
    await markCanceled(env, order.id, now);
    return true;
  }
  if (
    payment.status === 'succeeded' &&
    payment.id === order.stripe_payment_intent_id &&
    payment.orderId === order.id &&
    payment.source === 'devopsrockstars_store' &&
    payment.amountReceived === order.total_amount &&
    payment.currency === order.currency
  ) {
    await env.DB.prepare(
      `UPDATE orders
       SET status = 'paid', paid_at = ?, updated_at = ?
       WHERE id = ? AND status = 'awaiting_payment'`
    )
      .bind(now, now, order.id)
      .run();
    return true;
  }
  return false;
}

export async function cleanupExpiredOrders(
  env: Env,
  scheduledTime: number,
  dependencies: CleanupDependencies = defaultDependencies
) {
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  const now = new Date(scheduledTime).toISOString();
  const expired = await env.DB.prepare(
    `SELECT id, stripe_payment_intent_id, currency, total_amount
     FROM orders
     WHERE status IN ('creating_payment', 'awaiting_payment')
       AND reservation_expires_at <= ?
     ORDER BY reservation_expires_at
     LIMIT 100`
  )
    .bind(now)
    .all<ExpiredOrderRow>();

  for (const order of expired.results) {
    try {
      if (order.stripe_payment_intent_id) {
        if (!secretKey) {
          console.error(
            `Expired order ${order.id} cannot be reconciled without Stripe.`
          );
          continue;
        }
        try {
          if (
            await dependencies.cancelPaymentIntent(
              secretKey,
              order.stripe_payment_intent_id
            )
          ) {
            await markCanceled(env, order.id, now);
            continue;
          }
        } catch (cancelError) {
          console.error(
            `Failed to cancel expired order ${order.id}; reconciling:`,
            cancelError
          );
        }
        if (
          await reconcileUncanceledPayment(
            env,
            order,
            secretKey,
            now,
            dependencies
          )
        ) {
          continue;
        }
        console.error(`Expired order ${order.id} is still active at Stripe.`);
        continue;
      }
      await markCanceled(env, order.id, now);
    } catch (error) {
      console.error(`Failed to expire order ${order.id}:`, error);
    }
  }
}
