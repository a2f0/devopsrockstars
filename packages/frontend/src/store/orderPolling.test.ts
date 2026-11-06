import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ORDER_POLL_INTERVAL_MS, orderRetryDelay} from './orderPolling';

test('backs off after consecutive failed order reads, then gives up', () => {
  const delays: number[] = [];
  for (let failures = 1; ; failures++) {
    const delay = orderRetryDelay(failures);
    if (delay === null) break;
    delays.push(delay);
  }
  assert.deepEqual(delays, [1500, 3000, 6000, 12000, 15000, 15000]);
  assert.equal(delays[0], ORDER_POLL_INTERVAL_MS);
});

test('has no retry delay without a failure', () => {
  assert.equal(orderRetryDelay(0), null);
});
