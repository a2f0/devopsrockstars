import {expect, mock, spyOn, test} from 'bun:test';
import * as sentry from '@devopsrockstars/diagnostics/server';
import * as checkout from './checkout';
import {cleanupExpiredOrders} from './cleanup';
import * as diagnostics from './diagnostics';
import worker, {fetchHandler} from './index';
import * as orders from './orders';
import type {D1Database, Env} from './types';

const failureDatabase: D1Database = {
  prepare() {
    throw new Error('private database failure');
  },
  async batch() {
    return [];
  },
};
const requestEnvironment: Env = {
  DB: failureDatabase,
  CHECKOUT_HASH_SECRET: 'test-only',
  CHECKOUT_RATE_LIMITER: {limit: async () => ({success: true})},
};
function checkoutRequest(body: string) {
  return new Request('https://store.devopsrockstars.com/api/checkouts', {
    method: 'POST',
    headers: {'X-Checkout-Client': '12345678-1234-4234-8234-123456789abc'},
    body,
  });
}
const checkoutBody = JSON.stringify({
  items: [{variantId: 'hat-5950-7-1-4', quantity: 1}],
  shipping: {
    name: 'Test',
    email: 'test@example.com',
    addressLine1: '1 Test St',
    city: 'New York',
    state: 'NY',
    postalCode: '10001',
    country: 'US',
  },
});

test('thrown client errors and known unconfigured responses do not report', async () => {
  const report = spyOn(diagnostics, 'reportApiError').mockResolvedValue(
    undefined
  );
  const cancellation = spyOn(orders, 'cancelOrder').mockRejectedValue(
    new orders.OrderCancellationError('order_expired', 'Expired', 409)
  );
  try {
    for (const body of ['{', '{}'])
      expect(
        (await fetchHandler(checkoutRequest(body), requestEnvironment)).status
      ).toBe(400);
    expect(
      (
        await fetchHandler(
          new Request(
            'https://store.devopsrockstars.com/api/orders/12345678-1234-4234-8234-123456789abc/cancel',
            {method: 'POST'}
          ),
          requestEnvironment
        )
      ).status
    ).toBe(409);
    cancellation.mockRejectedValue(
      new orders.OrderCancellationError(
        'checkout_unavailable',
        'Unconfigured',
        503
      )
    );
    expect(
      (
        await fetchHandler(
          new Request(
            'https://store.devopsrockstars.com/api/orders/12345678-1234-4234-8234-123456789abc/cancel',
            {method: 'POST'}
          ),
          requestEnvironment
        )
      ).status
    ).toBe(503);
    expect(
      (await fetchHandler(checkoutRequest(checkoutBody), requestEnvironment))
        .status
    ).toBe(503);
    expect(
      (await fetchHandler(checkoutRequest(checkoutBody), {DB: failureDatabase}))
        .status
    ).toBe(503);
    expect(
      (
        await fetchHandler(
          new Request('https://store.devopsrockstars.com/api/webhooks/stripe', {
            method: 'POST',
          }),
          requestEnvironment
        )
      ).status
    ).toBe(503);
    expect(report).not.toHaveBeenCalled();
  } finally {
    cancellation.mockRestore();
    report.mockRestore();
  }
});

test('unexpected handled 503s still report and a missing context awaits delivery', async () => {
  const failure = new checkout.CheckoutCreationError(
    'checkout_unavailable',
    'The store is busy',
    503
  );
  const start = spyOn(checkout, 'startCheckout').mockRejectedValue(failure);
  let finish!: () => void;
  const delivery = new Promise<void>(resolve => {
    finish = resolve;
  });
  const report = spyOn(diagnostics, 'reportApiError').mockReturnValue(delivery);
  let completed = false;
  try {
    const response = fetchHandler(checkoutRequest(checkoutBody), {
      ...requestEnvironment,
      STRIPE_SECRET_KEY: 'test-only',
      STRIPE_PUBLISHABLE_KEY: 'test-only',
    }).then(value => {
      completed = true;
      return value;
    });
    for (let attempt = 0; attempt < 100 && !report.mock.calls.length; attempt++)
      await Bun.sleep(1);
    expect(report).toHaveBeenCalledWith(failure, 'request', 'checkout');
    expect(completed).toBe(false);
    finish();
    expect((await response).status).toBe(503);
  } finally {
    finish();
    start.mockRestore();
    report.mockRestore();
  }
});

test('concurrent request reports own separate clients and flush queues', async () => {
  const clients: {
    capture: ReturnType<typeof mock>;
    flush: ReturnType<typeof mock>;
  }[] = [];
  const factory = spyOn(
    sentry,
    'configureServerDiagnostics'
  ).mockImplementation(() => {
    const client = {capture: mock(() => {}), flush: mock(async () => true)};
    clients.push(client);
    return client;
  });
  try {
    await Promise.all([
      diagnostics.reportApiError(
        new Error('first request'),
        'request',
        'storefront'
      ),
      diagnostics.reportApiError(
        new Error('second request'),
        'request',
        'checkout'
      ),
    ]);
    expect(clients).toHaveLength(2);
    for (const client of clients) {
      expect(client.capture).toHaveBeenCalledTimes(1);
      expect(client.flush).toHaveBeenCalledTimes(1);
    }
  } finally {
    factory.mockRestore();
  }
});

test('a scheduled job failure reports the original error and preserves its rejection', async () => {
  const failure = new Error('private database details');
  const report = spyOn(diagnostics, 'reportApiError').mockResolvedValue(
    undefined
  );
  const promises: Promise<unknown>[] = [];
  const DB: D1Database = {
    prepare() {
      throw failure;
    },
    async batch() {
      return [];
    },
  };
  try {
    // Off the hour, so only the order cleanup runs.
    worker.scheduled(
      {scheduledTime: Date.UTC(2026, 9, 23, 12, 30)},
      {DB},
      {
        waitUntil(promise) {
          promises.push(promise);
        },
      }
    );
    expect(promises).toHaveLength(1);
    await expect(promises[0]).rejects.toBe(failure);
    expect(report).toHaveBeenCalledWith(failure, 'scheduled', 'cleanup');
  } finally {
    report.mockRestore();
  }
});

test('on the hour, the administrator sweep also reports its failure', async () => {
  const failure = new Error('private database details');
  const report = spyOn(diagnostics, 'reportApiError').mockResolvedValue(
    undefined
  );
  const promises: Promise<unknown>[] = [];
  const DB: D1Database = {
    prepare() {
      throw failure;
    },
    async batch() {
      return [];
    },
  };
  try {
    worker.scheduled(
      {scheduledTime: Date.UTC(2026, 9, 23, 13, 0)},
      {DB},
      {
        waitUntil(promise) {
          promises.push(promise);
        },
      }
    );
    expect(promises).toHaveLength(2);
    expect(await Promise.allSettled(promises)).toEqual([
      {status: 'rejected', reason: failure},
      {status: 'rejected', reason: failure},
    ]);
    expect(report).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenCalledWith(failure, 'scheduled', 'cleanup');
  } finally {
    report.mockRestore();
  }
});

test('cleanup captures each failed order, continues processing, and flushes only once at the end', async () => {
  const failure = new Error('private order details');
  let attempted = 0;
  const capture = mock(() => {});
  const flush = mock(async () => {
    expect(attempted).toBe(3);
    return true;
  });
  const factory = spyOn(diagnostics, 'createApiDiagnostics').mockReturnValue({
    capture,
    flush,
  });
  const logging = spyOn(console, 'error').mockImplementation(() => {});
  const DB: D1Database = {
    async batch() {
      return [];
    },
    prepare() {
      return {
        bind() {
          return this;
        },
        async first() {
          return null;
        },
        async run() {
          attempted++;
          throw failure;
        },
        async all<T>() {
          return {
            success: true,
            meta: {},
            results: [1, 2, 3].map(id => ({
              id: String(id),
              stripe_payment_intent_id: null,
            })) as unknown as T[],
          };
        },
      };
    },
  };
  try {
    await cleanupExpiredOrders({DB}, Date.now());
    expect(capture).toHaveBeenCalledTimes(3);
    expect(capture).toHaveBeenCalledWith(failure, 'scheduled', 'cleanup');
    expect(flush).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledTimes(1);
  } finally {
    factory.mockRestore();
    logging.mockRestore();
  }
});

test('API operations contain only a fixed vocabulary, never route identifiers or query values', () => {
  const id = '12345678-1234-1234-1234-123456789abc';
  for (const [pathname, operation] of [
    ['/api/storefront', 'storefront'],
    ['/api/checkouts', 'checkout'],
    ['/api/webhooks/stripe', 'stripe-webhook'],
    [`/api/orders/${id}`, 'order'],
    [`/api/orders/${id}/cancel`, 'cancel-order'],
    ['/api/admin/variants/hat-5950-7', 'admin'],
    ['/api/auth/sign-in/email', 'admin-auth'],
    ['/private-order', 'unknown'],
  ] as const)
    expect(
      diagnostics.requestOperation(
        new Request(
          `https://store.devopsrockstars.com${pathname}?token=private`
        )
      )
    ).toBe(operation);
});
