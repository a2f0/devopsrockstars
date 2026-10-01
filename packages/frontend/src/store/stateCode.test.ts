import assert from 'node:assert/strict';
import {test} from 'node:test';
import {stateCode} from './stateCode';

test('turns an autofilled state name into its code', () => {
  assert.equal(stateCode('New York'), 'NY');
  assert.equal(stateCode(' district of columbia '), 'DC');
  assert.equal(stateCode('U.S. Virgin Islands'), 'VI');
});

test('uppercases a typed code and leaves anything else for validation', () => {
  assert.equal(stateCode('ny'), 'NY');
  assert.equal(stateCode('N'), 'N');
  assert.equal(stateCode('New Yor'), 'NEW YOR');
});
