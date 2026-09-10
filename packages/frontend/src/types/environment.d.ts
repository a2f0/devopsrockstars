// Webpack replaces these expressions at build time. They are absent under
// tsx, so the reads stay guarded property accesses on globalThis.
declare var __SITE_ENVIRONMENT__: string | undefined;
declare var __STORE_API_ORIGIN__: string | undefined;
