import {expect, test} from 'bun:test';
import type {ErrorEvent} from '@sentry/core';
import {type DiagnosticsConfig, siteOriginMatches, validConfig} from './config';
import {sanitizeEvent} from './privacy';
import {privateTransport} from './transport';

const config: DiagnosticsConfig = {
  dsn: `https://${'a'.repeat(32)}@o1.ingest.us.sentry.io/1`,
  environment: 'staging',
  runtime: 'web',
  release: `devopsrockstars-web@${'b'.repeat(40)}`,
};
const secret = 'PRIVATE_ORDER_EMAIL_TOKEN';
function errorEvent(): ErrorEvent {
  return {
    type: undefined,
    event_id: 'a'.repeat(32),
    message: secret,
    request: {url: secret, data: secret, headers: {Authorization: secret}},
    user: {id: secret, email: secret},
    extra: {secret},
    contexts: {private: {secret}},
    breadcrumbs: [{message: secret}],
    tags: {diagnostic_source: 'unhandled-error', secret},
    exception: {
      values: [
        {
          type: secret,
          value: secret,
          stacktrace: {
            frames: [
              {
                filename: `https://staging.devopsrockstars.com/assets/index-abc123.js?${secret}#${secret}`,
                lineno: 20,
                colno: 3,
                function: secret,
                vars: {secret},
                context_line: secret,
              },
              {filename: `https://extension.invalid/${secret}`, lineno: 1},
            ],
          },
        },
      ],
    },
  };
}

test('rebuilds events without request, user, message, context, function or breadcrumb data', () => {
  const safe = sanitizeEvent(errorEvent(), config);
  expect(safe).not.toBeNull();
  expect(JSON.stringify(safe)).not.toContain(secret);
  expect(safe?.exception?.values?.[0]?.stacktrace?.frames).toEqual([
    {
      filename: 'app:///assets/index-abc123.js',
      lineno: 20,
      colno: 3,
      in_app: true,
    },
  ]);
  expect(safe?.user).toEqual({ip_address: '0.0.0.0'});
  expect(sanitizeEvent(safe ?? {}, config)).toEqual(safe);
});

test('drops non-errors, foreign code, unknown sources and cross-runtime reports', () => {
  expect(
    sanitizeEvent({...errorEvent(), type: 'transaction'}, config)
  ).toBeNull();
  expect(sanitizeEvent({message: secret}, config)).toBeNull();
  expect(
    sanitizeEvent(
      {...errorEvent(), tags: {diagnostic_source: 'request'}},
      config
    )
  ).toBeNull();
  const event = errorEvent();
  event.exception = {
    values: [
      {
        stacktrace: {
          frames: [
            {
              filename: `https://staging.devopsrockstars.com/store/${secret}`,
              lineno: 1,
            },
          ],
        },
      },
    ],
  };
  expect(sanitizeEvent(event, config)).toBeNull();
  event.tags = {diagnostic_source: 'react'};
  expect(sanitizeEvent(event, config)?.exception?.values?.[0]?.value).toBe(
    'Application error (message omitted)'
  );
});

test('configuration rejects invalid identities and local or mismatched origins', () => {
  expect(validConfig(config)).toBe(true);
  for (const dsn of [
    'https://key@example.com/1',
    `${config.dsn}?token=private`,
    config.dsn.replace('https:', 'http:'),
  ])
    expect(validConfig({...config, dsn})).toBe(false);
  expect(validConfig({...config, release: 'main'})).toBe(false);
  expect(siteOriginMatches('http://localhost:8080', 'staging')).toBe(false);
  expect(siteOriginMatches('https://devopsrockstars.com', 'staging')).toBe(
    false
  );
  expect(
    siteOriginMatches('https://www.devopsrockstars.com', 'production')
  ).toBe(true);
});

test('transport sends only scrubbed errors, omits credentials, and bounds duplicate and burst reports', async () => {
  const original = globalThis.fetch;
  const sent: RequestInit[] = [];
  globalThis.fetch = (async (_input, init) => {
    sent.push(init ?? {});
    return new Response('', {status: 200});
  }) as typeof fetch;
  try {
    const transport = privateTransport(config)({
      url: 'https://o1.ingest.us.sentry.io/api/1/envelope/',
      recordDroppedEvent() {},
    });
    const event = errorEvent();
    await transport.send([
      {secret, event_id: 'a'.repeat(32), sent_at: new Date().toISOString()},
      [
        [{type: 'event'}, event],
        [{type: 'attachment', length: secret.length, filename: secret}, secret],
      ],
    ]);
    await transport.send([
      {event_id: 'a'.repeat(32), sent_at: new Date().toISOString()},
      [[{type: 'event'}, event]],
    ]);
    await transport.send([
      {},
      [[{type: 'client_report'}, {timestamp: 0, discarded_events: []}]],
    ]);
    for (let line = 30; line < 40; line++) {
      const next = errorEvent();
      const frame = next.exception?.values?.[0]?.stacktrace?.frames?.[0];
      if (frame) frame.lineno = line;
      await transport.send([
        {event_id: 'a'.repeat(32), sent_at: new Date().toISOString()},
        [[{type: 'event'}, next]],
      ]);
    }
    await transport.flush(1000);
    expect(sent).toHaveLength(5);
    for (const request of sent) {
      expect(request.credentials).toBe('omit');
      expect(request.keepalive).toBe(true);
      expect(request.referrerPolicy).toBe('no-referrer');
      expect(String(request.body)).not.toContain(secret);
      expect(String(request.body)).not.toContain('attachment');
    }
  } finally {
    globalThis.fetch = original;
  }
});

test('API transports share quota state while omitting browser-only request options', async () => {
  const original = globalThis.fetch;
  const sent: RequestInit[] = [];
  globalThis.fetch = (async (_input, init) => {
    sent.push(init ?? {});
    return new Response('');
  }) as typeof fetch;
  try {
    const api = {
      ...config,
      runtime: 'api' as const,
      release: `devopsrockstars-api@${'b'.repeat(40)}`,
    };
    const first = privateTransport(api)({
      url: 'https://o1.ingest.us.sentry.io/api/1/envelope/',
      recordDroppedEvent() {},
    });
    const second = privateTransport(api)({
      url: 'https://o1.ingest.us.sentry.io/api/1/envelope/',
      recordDroppedEvent() {},
    });
    const event = {
      ...errorEvent(),
      tags: {diagnostic_source: 'request', operation: 'storefront'},
    };
    const header = {
      event_id: 'a'.repeat(32),
      sent_at: new Date().toISOString(),
    };
    await first.send([header, [[{type: 'event'}, event]]]);
    await second.send([header, [[{type: 'event'}, event]]]);
    await Promise.all([first.flush(1000), second.flush(1000)]);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.credentials).toBeUndefined();
    expect(sent[0]?.referrerPolicy).toBeUndefined();
    expect(sent[0]?.keepalive).toBeUndefined();
  } finally {
    globalThis.fetch = original;
  }
});
