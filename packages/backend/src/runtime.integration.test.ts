import {expect, test} from 'bun:test';
import {startLocalStack} from './localWorker';

test('Bun runs a real local Worker and proxies browser origin checks', async () => {
  const {site, origin, stop} = await startLocalStack();
  try {
    for (const [endpoint, expectedStatus] of [
      ['/api/checkouts', 400],
      ['/api/orders/10000000-0000-4000-8000-000000000001/cancel', 404],
    ] as const) {
      const response = await fetch(new URL(endpoint, site), {
        method: 'POST',
        body: '{}',
        signal: AbortSignal.timeout(5000),
        headers: {
          Origin: origin,
          'Sec-Fetch-Site': 'same-origin',
          'X-Order-Token': 'x'.repeat(101),
        },
      });
      // Input/authentication fails before any database or payment mutations.
      expect(response.status).toBe(expectedStatus);
      const body = (await response.json()) as {error: {code: string}};
      expect(body.error.code).toBe(
        expectedStatus === 400 ? 'invalid_checkout_client' : 'order_not_found'
      );
      const blocked = await fetch(new URL(endpoint, site), {
        method: 'POST',
        body: '{}',
        signal: AbortSignal.timeout(5000),
        headers: {
          Origin: 'https://attacker.example',
          'Sec-Fetch-Site': 'cross-site',
        },
      });
      expect(blocked.status).toBe(403);
      expect(
        ((await blocked.json()) as {error: {code: string}}).error.code
      ).toBe('forbidden');
    }
  } finally {
    await stop();
  }
}, 60000);
