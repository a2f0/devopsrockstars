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

// Staging is a publicly reachable host running unreleased work, so it ships
// without the store or search and asks crawlers to leave it alone.
export function siteFeatures(environment: SiteEnvironment): SiteFeatures {
  const released = environment === 'production';
  return {indexable: released, search: released, store: released};
}

const siteEnvironment = parseSiteEnvironment(globalThis.__SITE_ENVIRONMENT__);

export const features = siteFeatures(siteEnvironment);

// An empty origin means same-origin, which is what the webpack dev server and
// the browser tests use.
export const storeApiOrigin = globalThis.__STORE_API_ORIGIN__ ?? '';
