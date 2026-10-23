import {type ClientOptions, createTransport} from '@sentry/core';
import type {DiagnosticsConfig} from './config';
import {sanitizeEvent} from './privacy';

export function privateTransport(
  config: DiagnosticsConfig
): ClientOptions['transport'] {
  return options => {
    const seen = new Set<string>();
    let budgetStart = Date.now();
    let windowStart = budgetStart;
    let count = 0;
    const transport = createTransport(options, async ({body}) => {
      const response = await fetch(options.url, {
        method: 'POST',
        body: typeof body === 'string' ? body : new Uint8Array(body),
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        ...(config.runtime === 'web' ? {keepalive: true} : {}),
        signal: AbortSignal.timeout(5000),
      });
      return {
        statusCode: response.status,
        headers: {
          'x-sentry-rate-limits': response.headers.get('X-Sentry-Rate-Limits'),
          'retry-after': response.headers.get('Retry-After'),
        },
      };
    });
    return {
      flush: timeout => transport.flush(timeout),
      send(envelope) {
        for (const [header, payload] of envelope[1]) {
          if (header.type !== 'event') continue;
          const event = sanitizeEvent(
            payload as Parameters<typeof sanitizeEvent>[0],
            config
          );
          if (!event) continue;
          const now = Date.now();
          if (config.runtime === 'api' && now - budgetStart >= 3600000) {
            seen.clear();
            budgetStart = now;
          }
          if (now - windowStart >= 60000) {
            count = 0;
            windowStart = now;
          }
          const signature = JSON.stringify([event.exception, event.tags]);
          if (seen.size >= 20 || count >= 5 || seen.has(signature)) continue;
          seen.add(signature);
          count++;
          return transport.send([
            {
              event_id:
                event.event_id ?? crypto.randomUUID().replaceAll('-', ''),
              sent_at: new Date().toISOString(),
            },
            [[{type: 'event'}, event]],
          ]);
        }
        return Promise.resolve({});
      },
    };
  };
}
