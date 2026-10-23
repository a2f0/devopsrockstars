import type {DataCollection, ErrorEvent, Event, StackFrame} from '@sentry/core';
import {type DiagnosticsConfig, siteOriginMatches} from './config';

export type ErrorSource =
  | 'react'
  | 'unhandled-error'
  | 'unhandled-rejection'
  | 'request'
  | 'scheduled';
export type Operation =
  | 'storefront'
  | 'checkout'
  | 'order'
  | 'cancel-order'
  | 'stripe-webhook'
  | 'cleanup'
  | 'unknown';
const sources = new Set([
  'react',
  'unhandled-error',
  'unhandled-rejection',
  'request',
  'scheduled',
]);
const operations = new Set([
  'storefront',
  'checkout',
  'order',
  'cancel-order',
  'stripe-webhook',
  'cleanup',
  'unknown',
]);
const errorTypes = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'URIError',
  'EvalError',
  'AggregateError',
]);

export function privateDataCollection(): DataCollection {
  return {
    userInfo: false,
    cookies: false,
    httpHeaders: {request: false, response: false},
    httpBodies: [],
    urlQueryParams: false,
    genAI: {inputs: false, outputs: false},
    databaseQueryData: false,
    queues: false,
    graphQL: {document: false, variables: false},
    stackFrameVariables: false,
    frameContextLines: 0,
  };
}

function safeFrame(
  frame: StackFrame,
  config: DiagnosticsConfig
): StackFrame | undefined {
  if (typeof frame.filename !== 'string') return;
  let filename: string;
  if (config.runtime === 'api') {
    // workerd reports bundle positions, not original TypeScript positions.
    // Admit only our fixed Worker entry; uploaded maps supply source context.
    const bundle = config.workerBundleUrl;
    const allowed = ['index.js', 'app:///index.js'];
    if (bundle) {
      allowed.push(bundle);
      if (bundle.startsWith('file://')) allowed.push(new URL(bundle).pathname);
    }
    if (!allowed.includes(frame.filename)) return;
    filename = 'app:///index.js';
  } else {
    let url: URL;
    try {
      url = new URL(frame.filename);
    } catch {
      return;
    }
    if (
      url.protocol !== 'app:' &&
      !siteOriginMatches(url.origin, config.environment)
    )
      return;
    if (!/^\/assets\/[\w-]+-[a-z0-9]+\.js$/u.test(url.pathname)) return;
    filename = `app://${url.pathname}`;
  }
  if (
    typeof frame.lineno !== 'number' ||
    !Number.isSafeInteger(frame.lineno) ||
    frame.lineno < 1
  )
    return;
  return {
    filename,
    lineno: frame.lineno,
    in_app: true,
    ...(typeof frame.colno === 'number' &&
    Number.isSafeInteger(frame.colno) &&
    frame.colno >= 0
      ? {colno: frame.colno}
      : {}),
  };
}

// Rebuild, rather than redact, so new SDK fields cannot widen collection.
export function sanitizeEvent(
  event: Event,
  config: DiagnosticsConfig
): ErrorEvent | null {
  const source = event.tags?.['diagnostic_source'];
  if (
    event.type !== undefined ||
    typeof source !== 'string' ||
    !sources.has(source)
  )
    return null;
  if ((config.runtime === 'api') !== ['request', 'scheduled'].includes(source))
    return null;
  const exception = event.exception?.values?.[0];
  if (!exception) return null;
  const frames = (exception.stacktrace?.frames ?? [])
    .map(frame => safeFrame(frame, config))
    .filter((frame): frame is StackFrame => !!frame)
    .slice(-40);
  if (!frames.length && config.runtime === 'web' && source !== 'react')
    return null;
  const operation = event.tags?.['operation'];
  return {
    type: undefined,
    ...(typeof event.event_id === 'string' &&
    /^[a-f0-9]{32}$/u.test(event.event_id)
      ? {event_id: event.event_id}
      : {}),
    timestamp:
      typeof event.timestamp === 'number' && Number.isFinite(event.timestamp)
        ? event.timestamp
        : Date.now() / 1000,
    platform: 'javascript',
    level: 'error',
    environment: config.environment,
    release: config.release,
    dist: config.environment,
    user: {ip_address: '0.0.0.0'},
    tags: {
      runtime: config.runtime,
      diagnostic_source: source,
      privacy: 'allowlist-v1',
      ...(config.runtime === 'api' &&
      typeof operation === 'string' &&
      operations.has(operation)
        ? {operation}
        : {}),
    },
    exception: {
      values: [
        {
          type:
            exception.type && errorTypes.has(exception.type)
              ? exception.type
              : 'Error',
          value: 'Application error (message omitted)',
          ...(frames.length ? {stacktrace: {frames}} : {}),
          mechanism: {
            type: 'generic',
            handled: !source.startsWith('unhandled-'),
          },
        },
      ],
    },
  };
}
