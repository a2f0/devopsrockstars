import {BrowserClient, defaultStackParser, Scope} from '@sentry/browser';
import {type DiagnosticsConfig, siteOriginMatches, validConfig} from './config';
import {
  type ErrorSource,
  privateDataCollection,
  sanitizeEvent,
} from './privacy';
import {privateTransport} from './transport';

export function configureBrowserDiagnostics(
  config: DiagnosticsConfig | undefined
) {
  if (
    config?.runtime !== 'web' ||
    !validConfig(config) ||
    typeof window === 'undefined' ||
    !siteOriginMatches(window.location.origin, config.environment)
  )
    return;
  try {
    const client = new BrowserClient({
      dsn: config.dsn,
      environment: config.environment,
      release: config.release,
      dist: config.environment,
      stackParser: defaultStackParser,
      integrations: [],
      traceLifecycle: 'static',
      tracesSampleRate: 0,
      dataCollection: privateDataCollection(),
      sendClientReports: false,
      maxBreadcrumbs: 0,
      transport: privateTransport(config),
      beforeSend: event => sanitizeEvent(event, config),
    });
    const scope = new Scope();
    scope.setClient(client);
    client.init();
    const capture = (
      error: unknown,
      source: Exclude<ErrorSource, 'request' | 'scheduled'>
    ) => {
      try {
        if (error instanceof Error)
          scope.captureException(error, {
            captureContext: {tags: {diagnostic_source: source}},
          });
        else if (source === 'react')
          scope.captureEvent({
            tags: {diagnostic_source: source},
            exception: {values: [{type: 'Error'}]},
          });
      } catch {
        /* Diagnostics must not break the application. */
      }
    };
    const onError = (event: ErrorEvent) =>
      capture(event.error, 'unhandled-error');
    const onRejection = (event: PromiseRejectionEvent) =>
      capture(event.reason, 'unhandled-rejection');
    const flush = () => Promise.resolve(client.flush(6000)).catch(() => false);
    const onPageHide = () => {
      void flush();
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('pagehide', onPageHide);
    return {
      capture,
      flush,
      dispose() {
        window.removeEventListener('error', onError);
        window.removeEventListener('unhandledrejection', onRejection);
        window.removeEventListener('pagehide', onPageHide);
        return client.close(6000);
      },
    };
  } catch {
    return;
  }
}
