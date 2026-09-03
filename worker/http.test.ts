import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readJson, RequestBodyError} from './http';

test('reads a JSON request body', async () => {
  const request = new Request('https://store.example/api/checkouts', {
    method: 'POST',
    body: JSON.stringify({value: 'ok'}),
  });
  assert.deepEqual(await readJson(request), {value: 'ok'});
});

test('stops reading a streamed request above the byte limit', async () => {
  const request = new Request('https://store.example/api/checkouts', {
    method: 'POST',
    body: new Uint8Array(32_769),
  });
  await assert.rejects(
    readJson(request),
    (error: unknown) =>
      error instanceof RequestBodyError && error.code === 'request_too_large'
  );
});
