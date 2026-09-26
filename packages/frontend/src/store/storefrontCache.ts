import type {StorefrontResponse} from '@devopsrockstars/shared-types';
import {loadStorefront} from './api';

const freshnessMs = 30_000;

export function createStorefrontCache(
  load: () => Promise<StorefrontResponse>,
  now: () => number = Date.now
) {
  let cached: StorefrontResponse | null = null;
  let cachedAt = 0;
  let pending: Promise<StorefrontResponse> | null = null;
  let pendingPrefetch = false;

  function cachedStorefront() {
    return cached && now() - cachedAt < freshnessMs ? cached : null;
  }

  function storedStorefront() {
    return cached;
  }

  function fetchStorefront(refresh: boolean): Promise<StorefrontResponse> {
    if (pending) {
      // A direct Store visit should retry if its shared background request fails.
      return refresh && pendingPrefetch
        ? pending.catch(() => fetchStorefront(true))
        : pending;
    }
    const fresh = cachedStorefront();
    if (!refresh && fresh) return Promise.resolve(fresh);

    pendingPrefetch = !refresh;
    pending = load().then(
      storefront => {
        cached = storefront;
        cachedAt = now();
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

  return {
    cachedStorefront,
    storedStorefront,
    prefetchStorefront: () => fetchStorefront(false),
    refreshStorefront: () => fetchStorefront(true),
  };
}

export const {
  cachedStorefront,
  storedStorefront,
  prefetchStorefront,
  refreshStorefront,
} = createStorefrontCache(loadStorefront);
