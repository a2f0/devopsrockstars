import assert from 'node:assert/strict';
import {test} from 'node:test';
import {hmacToken} from './crypto';

test('derives the same URL-safe token from the same secret and message', async () => {
  const token = await hmacToken('secret', 'order-token:order:client');
  assert.equal(await hmacToken('secret', 'order-token:order:client'), token);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/u);
  assert.notEqual(await hmacToken('secret', 'order-token:other:client'), token);
  assert.notEqual(await hmacToken('other', 'order-token:order:client'), token);
});
