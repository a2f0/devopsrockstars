import type {StorefrontResponse} from '@devopsrockstars/shared-types';

/**
 * What the Store page knows about inventory.
 *
 * - `unverified`: a stored storefront, if any, is shown while it refreshes,
 *   and nothing can be added to the cart yet.
 * - `verified`: the storefront is fresh enough to sell from.
 * - `failed`: the refresh failed, so availability is unknown.
 */
export type StorefrontAvailability =
  | {
      readonly status: 'unverified';
      readonly storefront: StorefrontResponse | null;
    }
  | {readonly status: 'verified'; readonly storefront: StorefrontResponse}
  | {readonly status: 'failed'};

export type StorefrontAvailabilityEvent =
  | {readonly type: 'refreshed'; readonly storefront: StorefrontResponse}
  | {readonly type: 'failed'};

export function initialStorefrontAvailability(
  fresh: StorefrontResponse | null,
  stored: StorefrontResponse | null
): StorefrontAvailability {
  return fresh
    ? {status: 'verified', storefront: fresh}
    : {status: 'unverified', storefront: stored};
}

/** A failure is final for the page: it shows an error instead of the store. */
export function transitionStorefrontAvailability(
  availability: StorefrontAvailability,
  event: StorefrontAvailabilityEvent
): StorefrontAvailability {
  if (availability.status === 'failed') return availability;
  switch (event.type) {
    case 'refreshed':
      return {status: 'verified', storefront: event.storefront};
    case 'failed':
      return {status: 'failed'};
    default:
      return assertNever(event);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled storefront event: ${JSON.stringify(value)}`);
}
