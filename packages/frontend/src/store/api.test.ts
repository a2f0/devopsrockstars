import assert from 'node:assert/strict';
import {afterEach, test} from 'node:test';
import {cancelCheckout, createCheckout, loadStorefront} from './api';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// Answers each request with the next outcome: a status code, or an error that
// fetch throws the way a dropped connection does.
function stubFetch(outcomes: readonly (number | Error)[]) {
  const requests: RequestInit[] = [];
  globalThis.fetch = async (_input, init) => {
    requests.push(init ?? {});
    const outcome = outcomes[requests.length - 1];
    if (outcome === undefined) throw new Error('Unexpected request.');
    if (outcome instanceof Error) throw outcome;
    return Response.json({}, {status: outcome});
  };
  return requests;
}

const checkout = {
  items: [{variantId: 'hat-5950-7-1-4', quantity: 1}],
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
} as const;

test('retries a checkout once after a dropped connection', async () => {
  const requests = stubFetch([new TypeError('Failed to fetch'), 201]);
  await createCheckout(checkout, 'client-token');
  assert.equal(requests.length, 2);
  assert.equal(requests[1]?.method, 'POST');
  assert.equal(requests[1]?.body, requests[0]?.body);
});

test('reports a network failure that persists without the raw fetch error', async () => {
  const requests = stubFetch([
    new TypeError('Failed to fetch'),
    new TypeError('Failed to fetch'),
  ]);
  await assert.rejects(cancelCheckout('order-id', 'order-token'), {
    name: 'StoreApiError',
    message:
      'The store could not be reached. Check your connection and try again.',
  });
  assert.equal(requests.length, 2);
});

test('does not retry a response the store returned', async () => {
  const requests = stubFetch([503]);
  await assert.rejects(loadStorefront(), {name: 'StoreApiError'});
  assert.equal(requests.length, 1);
});

test('does not retry an aborted request', async () => {
  const controller = new AbortController();
  controller.abort();
  const aborted = new DOMException('Aborted', 'AbortError');
  const requests = stubFetch([aborted]);
  await assert.rejects(loadStorefront(controller.signal), aborted);
  assert.equal(requests.length, 1);
});
