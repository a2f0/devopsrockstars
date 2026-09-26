import type {StorefrontResponse} from '@devopsrockstars/shared-types';
import {loadStorefront} from './api';

const freshnessMs = 30_000;
let cached: StorefrontResponse | null = null;
let cachedAt = 0;
let pending: Promise<StorefrontResponse> | null = null;

export function cachedStorefront() {
  return cached;
}

function fetchStorefront(refresh: boolean): Promise<StorefrontResponse> {
  if (pending) return pending;
  if (!refresh && cached && Date.now() - cachedAt < freshnessMs) {
    return Promise.resolve(cached);
  }

  // Share a request when the user opens the store while prefetch is in flight.
  pending = loadStorefront().then(
    storefront => {
      cached = storefront;
      cachedAt = Date.now();
      pending = null;
      return storefront;
    },
    error => {
      pending = null;
      throw error;
    }
  );
  return pending;
}

export function prefetchStorefront() {
  return fetchStorefront(false);
}

export function refreshStorefront() {
  return fetchStorefront(true);
}
