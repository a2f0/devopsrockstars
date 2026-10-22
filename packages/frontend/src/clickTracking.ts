import {createTracker} from '@a2f0/ct-client';
import type {SiteEnvironment} from './environment';
import {type FeatureFlags, features} from './featureFlags';

export function trackingEnvironment(
  origin: string,
  environment: SiteEnvironment | undefined
): SiteEnvironment | null {
  if (
    environment === 'production' &&
    ['https://devopsrockstars.com', 'https://www.devopsrockstars.com'].includes(
      origin
    )
  ) {
    return environment;
  }
  return environment === 'staging' &&
    origin === 'https://staging.devopsrockstars.com'
    ? environment
    : null;
}

// Only fixed route names reach the collector, including on unknown URLs.
export function trackingPage(pathname: string, flags: FeatureFlags): string {
  if (pathname === '/' || pathname === '/company') return pathname;
  if (flags.search && pathname === '/search') return '/search';
  if (
    flags.store &&
    ['/store', '/store/checkout', '/store/receipt'].includes(pathname)
  ) {
    return pathname;
  }
  return '/not-found';
}

export function startClickTracking(): (() => void) | undefined {
  if (typeof window === 'undefined') return;
  const environment = trackingEnvironment(
    window.location.origin,
    globalThis.__SITE_ENVIRONMENT__
  );
  if (!environment) return;
  const tracker = createTracker({
    site: 'devopsrockstars',
    app: 'website',
    environment,
    capture: 'all',
    page: () => trackingPage(window.location.pathname, features),
  });
  tracker.init();
  return () => tracker.destroy();
}
