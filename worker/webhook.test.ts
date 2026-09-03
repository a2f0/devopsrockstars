import assert from 'node:assert/strict';
import {test} from 'node:test';
import {toHex} from './crypto';
import {verifyStripeSignature} from './webhook';

async function sign(payload: string, timestamp: number, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    {name: 'HMAC', hash: 'SHA-256'},
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${timestamp}.${payload}`)
  );
  return toHex(new Uint8Array(signature));
}

test('accepts a current Stripe webhook signature', async () => {
  const payload = '{"id":"evt_1"}';
  const timestamp = 1_800_000_000;
  const signature = await sign(payload, timestamp, 'whsec_test');
  assert.equal(
    await verifyStripeSignature(
      payload,
      `t=${timestamp},v1=${signature}`,
      'whsec_test',
      timestamp
    ),
    true
  );
});

test('rejects a modified webhook payload', async () => {
  const timestamp = 1_800_000_000;
  const signature = await sign('{"id":"evt_1"}', timestamp, 'whsec_test');
  assert.equal(
    await verifyStripeSignature(
      '{"id":"evt_2"}',
      `t=${timestamp},v1=${signature}`,
      'whsec_test',
      timestamp
    ),
    false
  );
});

test('rejects a webhook outside the replay tolerance', async () => {
  const timestamp = 1_800_000_000;
  const payload = '{"id":"evt_1"}';
  const signature = await sign(payload, timestamp, 'whsec_test');
  assert.equal(
    await verifyStripeSignature(
      payload,
      `t=${timestamp},v1=${signature}`,
      'whsec_test',
      timestamp + 301
    ),
    false
  );
});
