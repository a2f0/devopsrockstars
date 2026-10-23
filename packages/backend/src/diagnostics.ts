import type {DiagnosticsConfig} from '@devopsrockstars/diagnostics/config';
import type {Operation} from '@devopsrockstars/diagnostics/privacy';
import {configureServerDiagnostics} from '@devopsrockstars/diagnostics/server';

declare global {
  var __SENTRY_API__: DiagnosticsConfig | undefined;
}
let diagnostics: ReturnType<typeof configureServerDiagnostics>;

export async function reportApiError(
  error: unknown,
  source: 'request' | 'scheduled',
  operation: Operation
) {
  try {
    diagnostics ??= configureServerDiagnostics(globalThis.__SENTRY_API__);
    await diagnostics?.capture(error, source, operation);
  } catch {
    /* Error reporting cannot affect the store response. */
  }
}

export function requestOperation(request: Request): Operation {
  const pathname = new URL(request.url).pathname;
  if (pathname === '/api/storefront') return 'storefront';
  if (pathname === '/api/checkouts') return 'checkout';
  if (pathname === '/api/webhooks/stripe') return 'stripe-webhook';
  if (/^\/api\/orders\/[0-9a-f-]{36}\/cancel$/iu.test(pathname))
    return 'cancel-order';
  if (/^\/api\/orders\/[0-9a-f-]{36}$/iu.test(pathname)) return 'order';
  return 'unknown';
}
