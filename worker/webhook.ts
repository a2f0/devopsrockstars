import {constantTimeEqual, toHex} from './crypto';
import {json} from './http';
import type {D1PreparedStatement, Env} from './types';

const SIGNATURE_TOLERANCE_SECONDS = 300;
const encoder = new TextEncoder();

interface StripeSignature {
  readonly timestamp: number;
  readonly signatures: readonly string[];
}

interface StripeEvent {
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

async function loadEventOrder(
  env: Env,
  paymentIntent: Record<string, unknown>
) {
  const metadata = property(paymentIntent, 'metadata');
  const orderId = property(metadata, 'order_id');
  if (typeof orderId !== 'string') {
    throw new Error('Stripe PaymentIntent is missing order metadata.');
  }
  const order = await env.DB.prepare(
    `SELECT id, status, currency, total_amount, stripe_payment_intent_id
     FROM orders WHERE id = ?`
  )
    .bind(orderId)
    .first<EventOrderRow>();
  if (!order) throw new Error(`Stripe order ${orderId} was not found.`);
  const intentId = property(paymentIntent, 'id');
  if (
    typeof intentId !== 'string' ||
    order.stripe_payment_intent_id !== intentId
  ) {
    throw new Error(`Stripe intent did not match order ${orderId}.`);
  }
  return {order, intentId};
}

async function processSucceeded(env: Env, event: StripeEvent, now: string) {
  const {order} = await loadEventOrder(env, event.object);
  const amountReceived = property(event.object, 'amount_received');
  const currency = property(event.object, 'currency');
  if (
    amountReceived !== order.total_amount ||
    currency !== order.currency ||
    (order.status !== 'awaiting_payment' && order.status !== 'paid')
  ) {
    throw new Error(`Stripe payment did not match order ${order.id}.`);
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
  const {order} = await loadEventOrder(env, event.object);
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

async function processEvent(env: Env, event: StripeEvent) {
  const now = new Date().toISOString();
  if (event.type === 'payment_intent.succeeded') {
    await processSucceeded(env, event, now);
    return;
  }
  if (event.type === 'payment_intent.canceled') {
    await processCanceled(env, event, now);
    return;
  }
  await recordEvent(env, event, now);
}

export async function handleStripeWebhook(env: Env, request: Request) {
  const secret = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return json({error: 'Webhook is not configured.'}, 503);
  }
  const signature = request.headers.get('Stripe-Signature');
  const payload = await request.text();
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
