import {constantTimeEqual, toHex} from './crypto';
import {json, readBody} from './http';
import type {D1PreparedStatement, Env} from './types';

const SIGNATURE_TOLERANCE_SECONDS = 300;
const encoder = new TextEncoder();

interface StripeSignature {
  readonly timestamp: number;
  readonly signatures: readonly string[];
}

export interface StripeEvent {
  readonly id: string;
  readonly type: string;
  readonly object: Record<string, unknown>;
}

interface EventOrderRow {
  readonly currency: string;
  readonly id: string;
  readonly status: string;
  readonly stripe_payment_intent_id: string | null;
  readonly total_amount: number;
}

interface StorePaymentIntent {
  readonly intentId: string;
  readonly orderId: string;
}

type AlertAction = 'investigate' | 'refund';

function property(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return Reflect.get(value, key) as unknown;
}

function parseSignature(header: string): StripeSignature | null {
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === 't' && /^\d+$/u.test(value)) timestamp = Number(value);
    if (key === 'v1' && /^[0-9a-f]{64}$/iu.test(value)) {
      signatures.push(value.toLowerCase());
    }
  }
  return timestamp === null || signatures.length === 0
    ? null
    : {timestamp, signatures};
}

export async function verifyStripeSignature(
  payload: string,
  header: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  const parsed = parseSignature(header);
  if (
    !parsed ||
    Math.abs(nowSeconds - parsed.timestamp) > SIGNATURE_TOLERANCE_SECONDS
  ) {
    return false;
  }
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    {name: 'HMAC', hash: 'SHA-256'},
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${parsed.timestamp}.${payload}`)
  );
  const expected = toHex(new Uint8Array(digest));
  return parsed.signatures.some(signature =>
    constantTimeEqual(signature, expected)
  );
}

function parseEvent(value: unknown): StripeEvent | null {
  const id = property(value, 'id');
  const type = property(value, 'type');
  const eventObject = property(property(value, 'data'), 'object');
  if (
    typeof id !== 'string' ||
    typeof type !== 'string' ||
    typeof eventObject !== 'object' ||
    eventObject === null ||
    Array.isArray(eventObject)
  ) {
    return null;
  }
  return {id, type, object: eventObject as Record<string, unknown>};
}

function eventInsert(env: Env, event: StripeEvent, now: string) {
  return env.DB.prepare(
    `INSERT OR IGNORE INTO stripe_events (id, type, processed_at)
     VALUES (?, ?, ?)`
  ).bind(event.id, event.type, now);
}

function storePaymentIntent(
  paymentIntent: Record<string, unknown>
): StorePaymentIntent | null {
  const metadata = property(paymentIntent, 'metadata');
  const source = property(metadata, 'source');
  const orderId = property(metadata, 'order_id');
  const intentId = property(paymentIntent, 'id');
  return source === 'devopsrockstars_store' &&
    typeof orderId === 'string' &&
    typeof intentId === 'string'
    ? {orderId, intentId}
    : null;
}

async function loadEventOrder(env: Env, intent: StorePaymentIntent) {
  const order = await env.DB.prepare(
    `SELECT id, status, currency, total_amount, stripe_payment_intent_id
     FROM orders WHERE id = ?`
  )
    .bind(intent.orderId)
    .first<EventOrderRow>();
  return order;
}

function alertInsert(
  env: Env,
  event: StripeEvent,
  intent: StorePaymentIntent,
  reason: string,
  action: AlertAction,
  now: string
) {
  const amountReceived = property(event.object, 'amount_received');
  const currency = property(event.object, 'currency');
  return env.DB.prepare(
    `INSERT OR IGNORE INTO stripe_event_alerts (
       event_id, reason, action, order_id, payment_intent_id,
       amount_received, currency, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    event.id,
    reason,
    action,
    intent.orderId,
    intent.intentId,
    typeof amountReceived === 'number' ? amountReceived : null,
    typeof currency === 'string' ? currency : null,
    now
  );
}

async function recordAlert(
  env: Env,
  event: StripeEvent,
  intent: StorePaymentIntent,
  reason: string,
  action: AlertAction,
  now: string
) {
  await env.DB.batch([
    eventInsert(env, event, now),
    alertInsert(env, event, intent, reason, action, now),
  ]);
  console.error('Stripe event requires store follow-up:', {
    action,
    eventId: event.id,
    intentId: intent.intentId,
    orderId: intent.orderId,
    reason,
  });
}

async function processSucceeded(env: Env, event: StripeEvent, now: string) {
  const intent = storePaymentIntent(event.object);
  if (!intent) return;
  const order = await loadEventOrder(env, intent);
  if (!order) {
    await recordAlert(
      env,
      event,
      intent,
      'order_not_found',
      'investigate',
      now
    );
    return;
  }
  if (order.status === 'canceled') {
    await recordAlert(
      env,
      event,
      intent,
      'payment_received_after_cancellation',
      'refund',
      now
    );
    return;
  }
  if (order.stripe_payment_intent_id !== intent.intentId) {
    await recordAlert(
      env,
      event,
      intent,
      'intent_mismatch',
      'investigate',
      now
    );
    return;
  }
  const amountReceived = property(event.object, 'amount_received');
  const currency = property(event.object, 'currency');
  if (
    amountReceived !== order.total_amount ||
    currency !== order.currency ||
    (order.status !== 'awaiting_payment' && order.status !== 'paid')
  ) {
    await recordAlert(
      env,
      event,
      intent,
      'payment_mismatch',
      'investigate',
      now
    );
    return;
  }
  await env.DB.batch([
    eventInsert(env, event, now),
    env.DB.prepare(
      `UPDATE orders
       SET status = 'paid', paid_at = ?, updated_at = ?
       WHERE id = ? AND status = 'awaiting_payment'`
    ).bind(now, now, order.id),
  ]);
}

async function processCanceled(env: Env, event: StripeEvent, now: string) {
  const intent = storePaymentIntent(event.object);
  if (!intent) return;
  const order = await loadEventOrder(env, intent);
  if (!order) {
    await recordAlert(
      env,
      event,
      intent,
      'order_not_found',
      'investigate',
      now
    );
    return;
  }
  if (order.stripe_payment_intent_id !== intent.intentId) {
    await recordAlert(
      env,
      event,
      intent,
      'intent_mismatch',
      'investigate',
      now
    );
    return;
  }
  if (order.status === 'paid') {
    await recordAlert(
      env,
      event,
      intent,
      'cancellation_after_payment',
      'investigate',
      now
    );
    return;
  }
  await env.DB.batch([
    eventInsert(env, event, now),
    env.DB.prepare(
      `UPDATE orders
       SET status = 'canceled', canceled_at = ?, updated_at = ?
       WHERE id = ? AND status IN ('creating_payment', 'awaiting_payment')`
    ).bind(now, now, order.id),
  ]);
}

async function recordEvent(env: Env, event: StripeEvent, now: string) {
  const statements: D1PreparedStatement[] = [eventInsert(env, event, now)];
  await env.DB.batch(statements);
}

export async function processEvent(env: Env, event: StripeEvent) {
  const now = new Date().toISOString();
  if (event.type === 'payment_intent.succeeded') {
    await processSucceeded(env, event, now);
    return;
  }
  if (event.type === 'payment_intent.canceled') {
    await processCanceled(env, event, now);
    return;
  }
  if (storePaymentIntent(event.object)) {
    await recordEvent(env, event, now);
  }
}

export async function handleStripeWebhook(env: Env, request: Request) {
  const secret = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return json({error: 'Webhook is not configured.'}, 503);
  }
  const signature = request.headers.get('Stripe-Signature');
  let payload: string;
  try {
    payload = await readBody(request, 65_536);
  } catch {
    return json({error: 'Webhook payload is too large or unreadable.'}, 400);
  }
  if (
    !signature ||
    !(await verifyStripeSignature(payload, signature, secret))
  ) {
    return json({error: 'Invalid Stripe signature.'}, 400);
  }
  let value: unknown;
  try {
    value = JSON.parse(payload) as unknown;
  } catch {
    return json({error: 'Invalid webhook payload.'}, 400);
  }
  const event = parseEvent(value);
  if (!event) return json({error: 'Invalid webhook event.'}, 400);
  await processEvent(env, event);
  return json({received: true});
}
