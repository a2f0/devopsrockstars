import {
  type ClientOptions,
  createTransport,
  type ErrorEvent,
} from '@sentry/core';
import type {DiagnosticsConfig} from './config';
import {sanitizeEvent} from './privacy';

function eventBudget(resetAfter = Number.POSITIVE_INFINITY) {
  const seen = new Set<string>();
  let budgetStart = Date.now();
  let windowStart = budgetStart;
  let count = 0;
  return (event: ErrorEvent) => {
    const now = Date.now();
    if (now - budgetStart >= resetAfter) {
      seen.clear();
      budgetStart = now;
    }
    if (now - windowStart >= 60000) {
      count = 0;
      windowStart = now;
    }
    const signature = JSON.stringify([event.exception, event.tags]);
    if (seen.size >= 20 || count >= 5 || seen.has(signature)) return false;
    seen.add(signature);
    count++;
    return true;
  };
}

// Share only quota state across Worker requests, never clients or pending I/O.
const apiBudget = eventBudget(3600000);

export function privateTransport(
  config: DiagnosticsConfig
): ClientOptions['transport'] {
  return options => {
    const admit = config.runtime === 'api' ? apiBudget : eventBudget();
    const transport = createTransport(options, async ({body}) => {
      const response = await fetch(options.url, {
        method: 'POST',
        body: typeof body === 'string' ? body : new Uint8Array(body),
        ...(config.runtime === 'web'
          ? {
              credentials: 'omit' as const,
              referrerPolicy: 'no-referrer' as const,
              keepalive: true,
            }
          : {}),
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
          if (!event || !admit(event)) continue;
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
