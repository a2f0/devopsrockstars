import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {Stripe} from '@stripe/stripe-js';
import {createStripeLoader} from './stripeLoader';

const stripe = {} as Stripe;

test('shares one load per publishable key', async () => {
  const keys: string[] = [];
  const getStripe = createStripeLoader(key => {
    keys.push(key);
    return Promise.resolve(stripe);
  });

  assert.equal(getStripe('pk_a'), getStripe('pk_a'));
  assert.equal(await getStripe('pk_a'), stripe);
  await getStripe('pk_b');
  assert.deepEqual(keys, ['pk_a', 'pk_b']);
});

test('loads again after a failed load', async () => {
  let calls = 0;
  const getStripe = createStripeLoader(() => {
    calls++;
    return calls === 1
      ? Promise.reject(new Error('Failed to load Stripe.js'))
      : Promise.resolve(stripe);
  });

  await assert.rejects(getStripe('pk_a'), /Failed to load Stripe.js/);
  // The next payment form retries instead of reusing the failure.
  assert.equal(await getStripe('pk_a'), stripe);
  assert.equal(calls, 2);
});

test('keeps a newer key when an older load fails', async () => {
  let failOld!: (reason: unknown) => void;
  const loads = new Map<string, Promise<Stripe | null>>([
    ['pk_old', new Promise((_, reject) => (failOld = reject))],
    ['pk_new', Promise.resolve(stripe)],
  ]);
  let calls = 0;
  const getStripe = createStripeLoader(key => {
    calls++;
    return loads.get(key) ?? Promise.reject(new Error(key));
  });

  const old = getStripe('pk_old');
  const current = getStripe('pk_new');
  failOld(new Error('old'));
  await assert.rejects(old);
  assert.equal(getStripe('pk_new'), current);
  assert.equal(calls, 2);
});
