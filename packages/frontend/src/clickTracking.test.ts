import {describe, expect, test} from 'bun:test';
import {
  startClickTracking,
  trackingEnvironment,
  trackingPage,
} from './clickTracking';
import {disabledFeatureFlags, enabledFeatureFlags} from './featureFlags';

describe('click tracking configuration', () => {
  test('requires the exact deployed origin and matching build environment', () => {
    expect(
      trackingEnvironment('https://devopsrockstars.com', 'production')
    ).toBe('production');
    expect(
      trackingEnvironment('https://www.devopsrockstars.com', 'production')
    ).toBe('production');
    expect(
      trackingEnvironment('https://staging.devopsrockstars.com', 'staging')
    ).toBe('staging');
    for (const origin of [
      'https://devopsrockstars.com',
      'https://www.devopsrockstars.com',
      'https://staging.devopsrockstars.com',
    ]) {
      expect(trackingEnvironment(origin, undefined)).toBeNull();
    }
    expect(
      trackingEnvironment('https://devopsrockstars.com', 'staging')
    ).toBeNull();
    expect(
      trackingEnvironment('https://staging.devopsrockstars.com', 'production')
    ).toBeNull();
    for (const origin of [
      'http://localhost:8080',
      'http://127.0.0.1:8081',
      'https://devopsrockstars.com.evil.example',
      'http://devopsrockstars.com',
      'https://devopsrockstars.com:8443',
      'https://preview.workers.dev',
    ]) {
      expect(trackingEnvironment(origin, 'production')).toBeNull();
      expect(trackingEnvironment(origin, 'staging')).toBeNull();
    }
  });

  test('only reports fixed routes and respects disabled feature routes', () => {
    for (const pathname of ['/', '/company']) {
      expect(trackingPage(pathname, disabledFeatureFlags)).toBe(pathname);
    }
    for (const pathname of [
      '/search',
      '/store',
      '/store/checkout',
      '/store/receipt',
    ]) {
      expect(trackingPage(pathname, enabledFeatureFlags)).toBe(pathname);
      expect(trackingPage(pathname, disabledFeatureFlags)).toBe('/not-found');
    }
    for (const pathname of [
      '/customer/alice@example.com',
      '/store/receipt/order-token',
      '/company?secret=1',
    ]) {
      expect(trackingPage(pathname, enabledFeatureFlags)).toBe('/not-found');
    }
  });

  test('unbundled server and unit test execution does not initialize', () => {
    expect(startClickTracking()).toBeUndefined();
  });
});
