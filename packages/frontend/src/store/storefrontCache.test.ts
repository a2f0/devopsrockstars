import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {StorefrontResponse} from '@devopsrockstars/shared-types';
import {createStorefrontCache} from './storefrontCache';

const first: StorefrontResponse = {products: [], stripePublishableKey: null};
const second: StorefrontResponse = {products: [], stripePublishableKey: 'new'};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return {promise, resolve, reject};
}

test('prefetch shares an in-flight request and expires its snapshot', async () => {
  let time = 1_000;
  let calls = 0;
  const request = deferred<StorefrontResponse>();
  const cache = createStorefrontCache(
    () => {
      calls++;
      return calls === 1 ? request.promise : Promise.resolve(second);
    },
    () => time
  );

  const a = cache.prefetchStorefront();
  const b = cache.prefetchStorefront();
  assert.equal(a, b);
  assert.equal(calls, 1);
  request.resolve(first);
  assert.equal(await a, first);
  assert.equal(cache.cachedStorefront(), first);

  time += 29_999;
  assert.equal(await cache.prefetchStorefront(), first);
  assert.equal(calls, 1);
  time++;
  assert.equal(cache.cachedStorefront(), null);
  assert.equal(cache.storedStorefront(), first);
  assert.equal(await cache.prefetchStorefront(), second);
  assert.equal(calls, 2);
});

test('opening the store refreshes even a fresh prefetched snapshot', async () => {
  let calls = 0;
  const cache = createStorefrontCache(() => {
    calls++;
    return Promise.resolve(calls === 1 ? first : second);
  });

  await cache.prefetchStorefront();
  assert.equal(cache.cachedStorefront(), first);
  assert.equal(await cache.refreshStorefront(), second);
  assert.equal(cache.cachedStorefront(), second);
  assert.equal(calls, 2);
});

test('a failed prefetch can be retried', async () => {
  let calls = 0;
  const cache = createStorefrontCache(() => {
    calls++;
    return calls === 1
      ? Promise.reject(new Error('offline'))
      : Promise.resolve(first);
  });

  await assert.rejects(cache.prefetchStorefront(), /offline/u);
  assert.equal(cache.cachedStorefront(), null);
  assert.equal(await cache.prefetchStorefront(), first);
  assert.equal(calls, 2);
});

test('opening the store retries a failed in-flight prefetch', async () => {
  let calls = 0;
  const request = deferred<StorefrontResponse>();
  const cache = createStorefrontCache(() => {
    calls++;
    return calls === 1 ? request.promise : Promise.resolve(first);
  });

  const prefetch = cache.prefetchStorefront();
  const refresh = cache.refreshStorefront();
  request.reject(new Error('offline'));

  await assert.rejects(prefetch, /offline/u);
  assert.equal(await refresh, first);
  assert.equal(calls, 2);
});
