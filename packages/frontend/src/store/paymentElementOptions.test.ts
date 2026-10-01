import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PAYMENT_ELEMENT_OPTIONS} from './paymentElementOptions';

test('keeps Link, and the Klarna it offers, out of checkout', () => {
  assert.equal(PAYMENT_ELEMENT_OPTIONS.wallets?.link, 'never');
});

test('takes billing details from the shipping form', () => {
  assert.deepEqual(PAYMENT_ELEMENT_OPTIONS.fields?.billingDetails, {
    address: 'never',
    email: 'never',
    name: 'never',
  });
});
