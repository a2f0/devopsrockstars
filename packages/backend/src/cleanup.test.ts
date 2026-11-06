import {expect, test} from 'bun:test';
import {cleanupExpiredOrders} from './cleanup';
import {testDatabase} from './testDatabase';

const EXPIRED = '2026-09-03T16:00:00.000Z';
const NOW = Date.parse('2026-09-03T17:00:00.000Z');
const VARIANT = 'hat-5950-7';

async function seededDatabase() {
  const {db, sqlite} = await testDatabase();
  sqlite
    .query('UPDATE product_variants SET inventory_quantity = 10 WHERE id = ?')
    .run(VARIANT);
  const insertOrder = (
    id: string,
    intentId: string | null,
    expires: string
  ) => {
    sqlite
      .query(
        `INSERT INTO orders (
           id, access_token_hash, status, currency, subtotal_amount,
           shipping_amount, total_amount, email, shipping_name,
           shipping_address_line1, shipping_city, shipping_state,
           shipping_postal_code, shipping_country, stripe_payment_intent_id,
           reservation_expires_at, created_at, updated_at
         ) VALUES (?, 'hash', 'awaiting_payment', 'usd', 2000, 0, 2000,
           'buyer@example.test', 'Test Buyer', '1 Test Way', 'New York', 'NY',
           '10001', 'US', ?, ?, ?, ?)`
      )
      .run(id, intentId, expires, expires, expires);
    sqlite
      .query(
        `INSERT INTO order_items (
           order_id, variant_id, product_id, sku, product_name, variant_label,
           unit_amount, quantity, line_total
         ) VALUES (?, ?, 'hat-5950', 'DOR-5950-7', 'DevOpsRockstars 59FIFTY',
           '7', 2000, 1, 2000)`
      )
      .run(id, VARIANT);
  };
  const inventory = () =>
    (
      sqlite
        .query(
          'SELECT inventory_quantity AS n FROM product_variants WHERE id = ?'
        )
        .get(VARIANT) as {n: number}
    ).n;
  const status = (id: string) =>
    (
      sqlite.query('SELECT status FROM orders WHERE id = ?').get(id) as {
        status: string;
      }
    ).status;
  const alerts = () =>
    sqlite
      .query('SELECT event_id, order_id, action FROM stripe_event_alerts')
      .all();
  return {alerts, db, insertOrder, inventory, status};
}

// A PaymentIntent that succeeded for a different amount than its order: the
// customer was charged, so the order can be neither paid nor canceled.
function mismatchedPayments() {
  const calls: string[] = [];
  const dependencies = {
    cancelPaymentIntent: async (_key: string, intentId: string) => {
      calls.push(`cancel:${intentId}`);
      return false;
    },
    retrievePaymentIntent: async (_key: string, intentId: string) => {
      calls.push(`retrieve:${intentId}`);
      return {
        amountReceived: 1999,
        currency: 'usd',
        id: intentId,
        orderId: `order-${intentId.slice(3)}`,
        source: 'devopsrockstars_store',
        status: 'succeeded',
      };
    },
  };
  return {calls, dependencies};
}

test('cleanup alerts once on a mismatched paid order and keeps its stock', async () => {
  const store = await seededDatabase();
  store.insertOrder('order-1', 'pi_1', EXPIRED);
  const {calls, dependencies} = mismatchedPayments();
  const errors: unknown[] = [];
  const consoleError = console.error;
  console.error = (...values: unknown[]) => errors.push(values);
  try {
    for (let minute = 0; minute < 3; minute += 1)
      await cleanupExpiredOrders(
        {DB: store.db, STRIPE_SECRET_KEY: 'sk_test'},
        NOW + minute * 60_000,
        dependencies
      );
  } finally {
    console.error = consoleError;
  }

  // Stripe is asked once; later runs skip the order that awaits review.
  expect(calls).toEqual(['cancel:pi_1', 'retrieve:pi_1']);
  expect(store.alerts()).toEqual([
    {event_id: 'cleanup:pi_1', order_id: 'order-1', action: 'refund'},
  ]);
  expect(
    errors.filter(error => String(error).includes('requires reconciliation'))
  ).toHaveLength(1);
  // The customer paid, so the reserved hat stays out of stock until review.
  expect(store.status('order-1')).toBe('awaiting_payment');
  expect(store.inventory()).toBe(10);
});

test('orders awaiting review do not starve newer expired orders', async () => {
  const store = await seededDatabase();
  for (let index = 0; index < 100; index += 1)
    store.insertOrder(`order-${index}`, `pi_${index}`, EXPIRED);
  store.insertOrder('order-newer', null, '2026-09-03T16:30:00.000Z');
  const {dependencies} = mismatchedPayments();
  const consoleError = console.error;
  console.error = () => undefined;
  try {
    for (let minute = 0; minute < 2; minute += 1)
      await cleanupExpiredOrders(
        {DB: store.db, STRIPE_SECRET_KEY: 'sk_test'},
        NOW + minute * 60_000,
        dependencies
      );
  } finally {
    console.error = consoleError;
  }

  expect(store.alerts()).toHaveLength(100);
  expect(store.status('order-newer')).toBe('canceled');
  expect(store.inventory()).toBe(11);
});
