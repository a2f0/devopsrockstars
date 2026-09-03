import assert from 'node:assert/strict';
import {test} from 'node:test';
import {addCartItem} from './cart';

test('cart enforces the two-item checkout limit across variants', () => {
  const one = addCartItem([], 'size-one');
  const two = addCartItem(one, 'size-two');
  assert.deepEqual(two, [
    {variantId: 'size-one', quantity: 1},
    {variantId: 'size-two', quantity: 1},
  ]);
  assert.equal(addCartItem(two, 'size-three'), two);
  assert.equal(addCartItem(two, 'size-one'), two);
});
