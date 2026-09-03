import assert from 'node:assert/strict';
import {test} from 'node:test';

import type {CreateCheckoutRequest} from '../src/store/contracts';
import {
  type CheckoutDependencies,
  CheckoutCreationError,
  startCheckout,
} from './checkout';
import {sha256} from './crypto';
import {route} from './index';
import {loadOrder} from './orders';
import {StripeRequestError} from './stripe';
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  Env,
  RateLimit,
} from './types';
import {processEvent, type StripeEvent} from './webhook';

function result<T>(results: readonly T[] = [], changes = 1): D1Result<T> {
  return {meta: {changes}, results, success: true};
}

class FakeStatement implements D1PreparedStatement {
  values: readonly unknown[] = [];

  constructor(
    readonly database: FakeDatabase,
    readonly query: string
  ) {}

  bind(...values: readonly unknown[]) {
    this.values = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    return this.database.firstValue as T | null;
  }

  async all<T>(): Promise<D1Result<T>> {
    return result(this.database.allValues as readonly T[]);
  }

  async run<T>(): Promise<D1Result<T>> {
    this.database.runs.push(this);
    return result([], this.database.runChanges(this));
  }
}

class FakeDatabase implements D1Database {
  readonly batches: FakeStatement[][] = [];
  readonly statements: FakeStatement[] = [];
  readonly runs: FakeStatement[] = [];
  allValues: readonly unknown[] = [];
  batchFailure: Error | null = null;
  firstValue: unknown = null;
  runChanges: (statement: FakeStatement) => number = () => 1;

  prepare(query: string) {
    const statement = new FakeStatement(this, query);
    this.statements.push(statement);
    return statement;
  }

  async batch<T>(statements: readonly D1PreparedStatement[]) {
    const captured = statements.map(statement => {
      assert.ok(statement instanceof FakeStatement);
      return statement;
    });
    this.batches.push(captured);
    if (this.batchFailure) throw this.batchFailure;
    return captured.map(() => result<T>());
  }
}

function checkoutRequest(): CreateCheckoutRequest {
  return {
    items: [{variantId: 'hat-5950-7-1-4', quantity: 2}],
    shipping: {
      name: 'Grace Hopper',
      email: 'grace@example.com',
      addressLine1: '1 Navy Way',
      addressLine2: '',
      city: 'New York',
      state: 'NY',
      postalCode: '10001',
      country: 'US',
    },
  };
}

function checkoutEnv(database: FakeDatabase): Env {
  return {
    DB: database,
    STRIPE_PUBLISHABLE_KEY: 'pk_test_store',
    STRIPE_SECRET_KEY: 'sk_test_store',
  };
}

function dependencies(
  overrides: Partial<CheckoutDependencies> = {}
): CheckoutDependencies {
  return {
    cancelPaymentIntent: async () => true,
    createPaymentIntent: async () => ({
      clientSecret: 'pi_store_secret_test',
      id: 'pi_store',
    }),
    now: () => new Date('2026-09-03T12:00:00.000Z'),
    randomToken: () => 'order-token',
    randomUUID: () => '12345678-1234-1234-1234-123456789abc',
    sha256: async () => 'access-token-hash',
    ...overrides,
  };
}

function availableVariant() {
  return {
    active: 1,
    currency: 'usd',
    inventory_quantity: 5,
    label: '7 1/4',
    product_active: 1,
    product_id: 'hat-5950',
    product_name: 'DevOps Rockstars 59FIFTY',
    sku: 'DOR-5950-7-1-4',
    unit_amount: 2000,
    variant_id: 'hat-5950-7-1-4',
  };
}

test('checkout reserves inventory in one batch before creating payment', async () => {
  const database = new FakeDatabase();
  database.allValues = [availableVariant()];

  const checkout = await startCheckout(
    checkoutEnv(database),
    checkoutRequest(),
    'client-hash',
    dependencies()
  );

  assert.equal(checkout.totalAmount, 4000);
  assert.equal(database.batches.length, 1);
  assert.equal(database.batches[0]?.length, 3);
  assert.equal(database.batches[0]?.[0]?.values[2], 'client-hash');
  const inventoryUpdate = database.batches[0]?.find(statement =>
    statement.query.includes('inventory_quantity = inventory_quantity - ?')
  );
  assert.deepEqual(inventoryUpdate?.values, [
    2,
    '2026-09-03T12:00:00.000Z',
    'hat-5950-7-1-4',
  ]);
});

test('checkout maps an atomic negative-inventory rollback to out of stock', async () => {
  const database = new FakeDatabase();
  database.allValues = [availableVariant()];
  database.batchFailure = new Error('inventory_below_zero');
  let createPaymentCalls = 0;

  await assert.rejects(
    startCheckout(
      checkoutEnv(database),
      checkoutRequest(),
      'client-hash',
      dependencies({
        createPaymentIntent: async () => {
          createPaymentCalls += 1;
          return {clientSecret: 'unused', id: 'pi_unused'};
        },
      })
    ),
    (error: unknown) =>
      error instanceof CheckoutCreationError && error.code === 'out_of_stock'
  );
  assert.equal(createPaymentCalls, 0);
});

test('checkout maps the active-reservation trigger to a rate limit', async () => {
  const database = new FakeDatabase();
  database.allValues = [availableVariant()];
  database.batchFailure = new Error('checkout_rate_limited');

  await assert.rejects(
    startCheckout(
      checkoutEnv(database),
      checkoutRequest(),
      'client-hash',
      dependencies()
    ),
    (error: unknown) =>
      error instanceof CheckoutCreationError &&
      error.code === 'checkout_rate_limited' &&
      error.status === 429
  );
});

test('checkout cancels its reservation when Stripe creation fails', async () => {
  const database = new FakeDatabase();
  database.allValues = [availableVariant()];

  await assert.rejects(
    startCheckout(
      checkoutEnv(database),
      checkoutRequest(),
      'client-hash',
      dependencies({
        createPaymentIntent: async () => {
          throw new StripeRequestError('PaymentIntent creation', 503);
        },
      })
    ),
    (error: unknown) =>
      error instanceof CheckoutCreationError &&
      error.code === 'payment_provider_unavailable'
  );
  assert.ok(
    database.runs.some(statement =>
      statement.query.includes("SET status = 'canceled'")
    )
  );
});

test('checkout records an orphaned PaymentIntent when cancellation fails', async t => {
  t.mock.method(console, 'error', () => undefined);
  const database = new FakeDatabase();
  database.allValues = [availableVariant()];
  database.runChanges = statement =>
    statement.query.includes("SET status = 'awaiting_payment'") ? 0 : 1;
  const canceledIntents: string[] = [];

  await assert.rejects(
    startCheckout(
      checkoutEnv(database),
      checkoutRequest(),
      'client-hash',
      dependencies({
        cancelPaymentIntent: async (_secret, intentId) => {
          canceledIntents.push(intentId);
          throw new StripeRequestError('PaymentIntent cancellation', 503);
        },
      })
    ),
    /reserved order could not be activated/
  );
  assert.deepEqual(canceledIntents, ['pi_store']);
  const cancellation = database.runs.find(statement =>
    statement.query.includes("SET status = 'canceled'")
  );
  assert.deepEqual(cancellation?.values, [
    'pi_store',
    1,
    '2026-09-03T12:00:00.000Z',
    '2026-09-03T12:00:00.000Z',
    '2026-09-03T12:00:00.000Z',
    '12345678-1234-1234-1234-123456789abc',
  ]);
});

function stripeEvent(
  type: string,
  object: Record<string, unknown>
): StripeEvent {
  return {id: `evt_${type}`, type, object};
}

function storeIntent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pi_store',
    amount_received: 4000,
    currency: 'usd',
    metadata: {
      order_id: '12345678-1234-1234-1234-123456789abc',
      source: 'devopsrockstars_store',
    },
    ...overrides,
  };
}

function eventOrder(status: string) {
  return {
    currency: 'usd',
    id: '12345678-1234-1234-1234-123456789abc',
    status,
    stripe_payment_intent_id: 'pi_store',
    total_amount: 4000,
  };
}

test('webhook acknowledges unrelated account PaymentIntents without DB work', async () => {
  const database = new FakeDatabase();
  await processEvent(
    {DB: database},
    stripeEvent('payment_intent.succeeded', {
      ...storeIntent(),
      metadata: {source: 'another_application'},
    })
  );

  assert.equal(database.statements.length, 0);
  assert.equal(database.batches.length, 0);
});

test('webhook marks a matching awaiting order paid idempotently', async () => {
  const database = new FakeDatabase();
  database.firstValue = eventOrder('awaiting_payment');
  await processEvent(
    {DB: database},
    stripeEvent('payment_intent.succeeded', storeIntent())
  );

  assert.equal(database.batches.length, 1);
  assert.ok(
    database.batches[0]?.some(statement =>
      statement.query.includes('INSERT OR IGNORE INTO stripe_events')
    )
  );
  assert.ok(
    database.batches[0]?.some(statement =>
      statement.query.includes("SET status = 'paid'")
    )
  );
});

test('webhook safely replays a succeeded event for an already-paid order', async () => {
  const database = new FakeDatabase();
  database.firstValue = eventOrder('paid');
  const event = stripeEvent('payment_intent.succeeded', storeIntent());

  await processEvent({DB: database}, event);
  await processEvent({DB: database}, event);

  assert.equal(database.batches.length, 2);
  for (const batch of database.batches) {
    assert.ok(
      batch.some(statement =>
        statement.query.includes('INSERT OR IGNORE INTO stripe_events')
      )
    );
    assert.ok(
      batch.some(statement =>
        statement.query.includes("WHERE id = ? AND status = 'awaiting_payment'")
      )
    );
  }
});

test('webhook queues a refund when payment succeeds after cancellation', async t => {
  t.mock.method(console, 'error', () => undefined);
  const database = new FakeDatabase();
  database.firstValue = {
    ...eventOrder('canceled'),
    stripe_payment_intent_id: null,
  };
  await processEvent(
    {DB: database},
    stripeEvent('payment_intent.succeeded', storeIntent())
  );

  const alert = database.batches[0]?.find(statement =>
    statement.query.includes('INSERT OR IGNORE INTO stripe_event_alerts')
  );
  assert.deepEqual(alert?.values.slice(1, 5), [
    'payment_received_after_cancellation',
    'refund',
    '12345678-1234-1234-1234-123456789abc',
    'pi_store',
  ]);
  assert.equal(
    database.batches[0]?.some(statement =>
      statement.query.includes("SET status = 'paid'")
    ),
    false
  );
});

test('webhook records a missing store order for investigation', async t => {
  t.mock.method(console, 'error', () => undefined);
  const database = new FakeDatabase();
  await processEvent(
    {DB: database},
    stripeEvent('payment_intent.succeeded', storeIntent())
  );

  const alert = database.batches[0]?.find(statement =>
    statement.query.includes('INSERT OR IGNORE INTO stripe_event_alerts')
  );
  assert.equal(alert?.values[1], 'order_not_found');
  assert.equal(alert?.values[2], 'investigate');
});

test('webhook records amount or currency mismatches without marking paid', async t => {
  t.mock.method(console, 'error', () => undefined);
  for (const mismatch of [{amount_received: 3999}, {currency: 'eur'}]) {
    const database = new FakeDatabase();
    database.firstValue = eventOrder('awaiting_payment');
    await processEvent(
      {DB: database},
      stripeEvent('payment_intent.succeeded', storeIntent(mismatch))
    );

    const alert = database.batches[0]?.find(statement =>
      statement.query.includes('INSERT OR IGNORE INTO stripe_event_alerts')
    );
    assert.equal(alert?.values[1], 'payment_mismatch');
    assert.equal(
      database.batches[0]?.some(statement =>
        statement.query.includes("SET status = 'paid'")
      ),
      false
    );
  }
});

test('order lookup requires the matching bearer token hash', async () => {
  const database = new FakeDatabase();
  database.firstValue = {
    access_token_hash: await sha256('correct-token'),
    currency: 'usd',
    id: '12345678-1234-1234-1234-123456789abc',
    status: 'paid',
    total_amount: 4000,
  };
  const env = {DB: database};

  assert.deepEqual(
    await loadOrder(
      env,
      '12345678-1234-1234-1234-123456789abc',
      'correct-token'
    ),
    {
      currency: 'usd',
      orderId: '12345678-1234-1234-1234-123456789abc',
      status: 'paid',
      totalAmount: 4000,
    }
  );
  assert.equal(
    await loadOrder(env, '12345678-1234-1234-1234-123456789abc', 'wrong-token'),
    null
  );
});

test('checkout route applies the Cloudflare rate limit before creating work', async () => {
  const database = new FakeDatabase();
  const keys: string[] = [];
  const rateLimiter: RateLimit = {
    async limit({key}) {
      keys.push(key);
      return {success: false};
    },
  };
  const request = new Request('https://store.example/api/checkouts', {
    method: 'POST',
    headers: {'CF-Connecting-IP': '203.0.113.10'},
    body: JSON.stringify(checkoutRequest()),
  });

  const response = await route(request, {
    DB: database,
    CHECKOUT_RATE_LIMITER: rateLimiter,
  });

  assert.equal(response.status, 429);
  assert.deepEqual(keys, ['checkout:203.0.113.10']);
  assert.deepEqual(await response.json(), {
    error: {
      code: 'checkout_rate_limited',
      message:
        'Too many checkout attempts. Please wait a minute and try again.',
    },
  });
  assert.equal(database.statements.length, 0);
});
