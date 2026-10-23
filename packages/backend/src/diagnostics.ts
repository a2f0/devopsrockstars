import type {DiagnosticsConfig} from '@devopsrockstars/diagnostics/config';
import type {Operation} from '@devopsrockstars/diagnostics/privacy';
import {configureServerDiagnostics} from '@devopsrockstars/diagnostics/server';

declare global {
  var __SENTRY_API__: DiagnosticsConfig | undefined;
}
export function createApiDiagnostics() {
  try {
    return configureServerDiagnostics(globalThis.__SENTRY_API__);
  } catch {
    return undefined;
  }
}

export async function reportApiError(
  error: unknown,
  source: 'request' | 'scheduled',
  operation: Operation
) {
  const diagnostics = createApiDiagnostics();
  diagnostics?.capture(error, source, operation);
  await diagnostics?.flush();
}

export function requestOperation(request: Request): Operation {
  const pathname = new URL(request.url).pathname;
  if (pathname === '/api/storefront') return 'storefront';
  if (pathname === '/api/checkouts') return 'checkout';
  if (pathname === '/api/webhooks/stripe') return 'stripe-webhook';
  if (pathname.startsWith('/api/admin/')) return 'admin';
  if (pathname.startsWith('/api/auth/')) return 'admin-auth';
  if (/^\/api\/orders\/[0-9a-f-]{36}\/cancel$/iu.test(pathname))
    return 'cancel-order';
  if (/^\/api\/orders\/[0-9a-f-]{36}$/iu.test(pathname)) return 'order';
  return 'unknown';
}
