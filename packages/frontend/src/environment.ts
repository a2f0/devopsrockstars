export type SiteEnvironment = 'production' | 'staging';

export interface SiteFeatures {
  readonly indexable: boolean;
  readonly search: boolean;
  readonly store: boolean;
}

export function parseSiteEnvironment(
  value: string | undefined
): SiteEnvironment {
  return value === 'staging' ? 'staging' : 'production';
}

// The store and search are not ready to launch, so production hides them while
// staging keeps them reachable for testing. Staging is publicly resolvable, so
// only production is offered to search engines.
export function siteFeatures(environment: SiteEnvironment): SiteFeatures {
  const production = environment === 'production';
  return {indexable: production, search: !production, store: !production};
}

const siteEnvironment = parseSiteEnvironment(globalThis.__SITE_ENVIRONMENT__);

export const features = siteFeatures(siteEnvironment);

// An empty origin means same-origin, which is what the Bun dev server and
// the browser tests use.
export const storeApiOrigin = globalThis.__STORE_API_ORIGIN__ ?? '';
