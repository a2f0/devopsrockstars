import {expect, mock, spyOn, test} from 'bun:test';
import * as sentry from '@devopsrockstars/diagnostics/server';
import {cleanupExpiredOrders} from './cleanup';
import * as diagnostics from './diagnostics';
import worker from './index';
import type {D1Database} from './types';

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
    worker.scheduled(
      {scheduledTime: Date.now()},
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
