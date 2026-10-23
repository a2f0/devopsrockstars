import {createStackParser, Scope} from '@sentry/core';
import {nodeStackLineParser, ServerRuntimeClient} from '@sentry/core/server';
import {type DiagnosticsConfig, validConfig} from './config';
import {type Operation, privateDataCollection, sanitizeEvent} from './privacy';
import {privateTransport} from './transport';

export function configureServerDiagnostics(
  input: DiagnosticsConfig | undefined
) {
  if (input?.runtime !== 'api' || !validConfig(input)) return;
  const stackParser = createStackParser(nodeStackLineParser());
  // workerd has no import.meta.url. Derive the exact bundle filename from
  // our own stack, never from a captured error or incoming request.
  const config = {
    ...input,
    workerBundleUrl:
      stackParser(new Error().stack ?? '').at(-1)?.filename ?? 'index.js',
  };
  const client = new ServerRuntimeClient({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    dist: config.environment,
    stackParser,
    integrations: [],
    traceLifecycle: 'static',
    tracesSampleRate: 0,
    dataCollection: privateDataCollection(),
    sendClientReports: false,
    maxBreadcrumbs: 0,
    transport: privateTransport(config),
    beforeSend: event => sanitizeEvent(event, config),
  });
  client.init();
  return {
    async capture(
      error: unknown,
      source: 'request' | 'scheduled',
      operation: Operation
    ) {
      try {
        const scope = new Scope();
        scope.setClient(client);
        scope.captureException(
          error instanceof Error ? error : new Error('Application failure'),
          {captureContext: {tags: {diagnostic_source: source, operation}}}
        );
        await client.flush(2000);
      } catch {
        /* Preserve the original response or scheduled failure. */
      }
    },
  };
}
