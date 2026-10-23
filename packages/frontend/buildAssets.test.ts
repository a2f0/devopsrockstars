import assert from 'node:assert/strict';
import {test} from 'node:test';
import {headersFile, robotsMetaTags, robotsTxt} from './buildAssets';

const production = 'production';
const staging = 'staging';

test('production invites crawlers everywhere but the admin', () => {
  assert.deepEqual(robotsMetaTags(production), {});
  assert.match(robotsTxt(production), /^User-agent: \*\nAllow: \/\n$/u);
  const rules = headersFile(production).trimEnd().split('\n\n');
  assert.doesNotMatch(rules[0] ?? '', /X-Robots-Tag/u);
  for (const path of ['/admin', '/admin/*'])
    assert.ok(
      rules.includes(`${path}\n  X-Robots-Tag: noindex, nofollow`),
      path
    );
});

test('staging refuses crawlers in the document, robots.txt, and headers', () => {
  assert.deepEqual(robotsMetaTags(staging), {robots: 'noindex, nofollow'});
  assert.match(robotsTxt(staging), /^User-agent: \*\nDisallow: \/\n$/u);
  assert.match(headersFile(staging), /^ {2}X-Robots-Tag: noindex, nofollow$/mu);
});

test('content-hashed bundles are cached immutably in every environment', () => {
  for (const headers of [headersFile(production), headersFile(staging)]) {
    assert.match(headers, /^\/\*$/mu);
    assert.match(
      headers,
      /^ {2}Cache-Control: public, no-cache, must-revalidate$/mu
    );
    assert.match(headers, /^\/assets\/\*$/mu);
    assert.match(
      headers,
      /^ {2}Cache-Control: public, max-age=31536000, immutable$/mu
    );
  }
});
