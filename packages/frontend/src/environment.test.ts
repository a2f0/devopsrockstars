import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseSiteEnvironment, siteFeatures} from './environment';

test('site environment falls back to production for unknown values', () => {
  assert.equal(parseSiteEnvironment('staging'), 'staging');
  assert.equal(parseSiteEnvironment('production'), 'production');
  assert.equal(parseSiteEnvironment(undefined), 'production');
  assert.equal(parseSiteEnvironment(''), 'production');
  assert.equal(parseSiteEnvironment('Staging'), 'production');
});

test('staging hides the store and search and stays out of search engines', () => {
  assert.deepEqual(siteFeatures('staging'), {
    indexable: false,
    search: false,
    store: false,
  });
  assert.deepEqual(siteFeatures('production'), {
    indexable: true,
    search: true,
    store: true,
  });
});
