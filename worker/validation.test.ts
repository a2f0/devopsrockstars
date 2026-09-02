import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CheckoutValidationError, validateCheckout} from './validation';

function validCheckout() {
  return {
    items: [{variantId: 'hat-5950-7-1-4', quantity: 1}],
    shipping: {
      name: 'Grace Hopper',
      email: 'GRACE@example.com',
      addressLine1: '1 Navy Way',
      addressLine2: '',
      city: 'New York',
      state: 'ny',
      postalCode: '10001',
      country: 'US',
    },
  };
}

test('normalizes a valid checkout', () => {
  const checkout = validateCheckout(validCheckout());
  assert.equal(checkout.shipping.email, 'grace@example.com');
  assert.equal(checkout.shipping.state, 'NY');
  assert.deepEqual(checkout.items, [
    {variantId: 'hat-5950-7-1-4', quantity: 1},
  ]);
});

test('combines duplicate variants before enforcing quantity limits', () => {
  const input = validCheckout();
  input.items.push({variantId: 'hat-5950-7-1-4', quantity: 2});
  assert.deepEqual(validateCheckout(input).items, [
    {variantId: 'hat-5950-7-1-4', quantity: 3},
  ]);
});

test('rejects an invalid shipping region', () => {
  const input = validCheckout();
  input.shipping.state = 'ZZ';
  assert.throws(
    () => validateCheckout(input),
    (error: unknown) =>
      error instanceof CheckoutValidationError &&
      error.code === 'invalid_shipping'
  );
});

test('rejects more than five hats in one size', () => {
  const input = validCheckout();
  input.items[0] = {variantId: 'hat-5950-7-1-4', quantity: 6};
  assert.throws(
    () => validateCheckout(input),
    (error: unknown) =>
      error instanceof CheckoutValidationError && error.code === 'invalid_cart'
  );
});
