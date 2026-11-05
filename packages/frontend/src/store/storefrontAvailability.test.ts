import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {StorefrontResponse} from '@devopsrockstars/shared-types';
import {
  initialStorefrontAvailability,
  type StorefrontAvailability,
  type StorefrontAvailabilityEvent,
  transitionStorefrontAvailability,
} from './storefrontAvailability';

const stored: StorefrontResponse = {products: [], stripePublishableKey: null};
const fresh: StorefrontResponse = {products: [], stripePublishableKey: 'pk'};

test('starts verified only from a fresh snapshot', () => {
  assert.deepEqual(initialStorefrontAvailability(fresh, fresh), {
    status: 'verified',
    storefront: fresh,
  });
  assert.deepEqual(initialStorefrontAvailability(null, stored), {
    status: 'unverified',
    storefront: stored,
  });
  assert.deepEqual(initialStorefrontAvailability(null, null), {
    status: 'unverified',
    storefront: null,
  });
});

const cases: ReadonlyArray<
  readonly [
    StorefrontAvailability,
    StorefrontAvailabilityEvent,
    StorefrontAvailability,
  ]
> = [
  [
    {status: 'unverified', storefront: stored},
    {type: 'refreshed', storefront: fresh},
    {status: 'verified', storefront: fresh},
  ],
  [
    {status: 'verified', storefront: stored},
    {type: 'refreshed', storefront: fresh},
    {status: 'verified', storefront: fresh},
  ],
  [
    {status: 'unverified', storefront: stored},
    {type: 'failed'},
    {status: 'failed'},
  ],
  [
    {status: 'verified', storefront: fresh},
    {type: 'failed'},
    {status: 'failed'},
  ],
  [
    {status: 'failed'},
    {type: 'refreshed', storefront: fresh},
    {status: 'failed'},
  ],
  [{status: 'failed'}, {type: 'failed'}, {status: 'failed'}],
];

for (const [state, event, next] of cases) {
  test(`${state.status} + ${event.type} -> ${next.status}`, () => {
    assert.deepEqual(transitionStorefrontAvailability(state, event), next);
  });
}

test('a failed refresh drops the unverified storefront', () => {
  // The page never shows stale inventory beside the error.
  const next = transitionStorefrontAvailability(
    {status: 'unverified', storefront: stored},
    {type: 'failed'}
  );
  assert.equal('storefront' in next, false);
});
