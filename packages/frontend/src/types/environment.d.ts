// Bun replaces these expressions in browser builds. They are absent in
// runtime tests, so the reads stay guarded property accesses on globalThis.
declare var __FEATURE_FLAGS__: import('../featureFlags').FeatureFlags | undefined;
declare var __STORE_API_ORIGIN__: string | undefined;
declare var __SITE_ENVIRONMENT__: import('../environment').SiteEnvironment | undefined;
