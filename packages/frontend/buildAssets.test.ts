import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  headersFile,
  pageFile,
  pageHead,
  robotsTxt,
  sitemapXml,
} from './buildAssets';
import {pageUrl} from './src/pageHead';
import {disabledFeatureFlags, enabledFeatureFlags} from './src/featureFlags';
import {notFoundPage, type Page, pageTitle, sitePages} from './src/pages';
import {storeRoutes} from './src/routes';

const production = 'production';
const staging = 'staging';
const productionPages = sitePages(disabledFeatureFlags);
const allPages = sitePages(enabledFeatureFlags);

function page(path: string) {
  const found = allPages.find(candidate => candidate.path === path);
  assert.ok(found, path);
  return found;
}

function tagContent(head: string, attribute: string, name: string) {
  return head.match(
    new RegExp(`<meta ${attribute}="${name}" content="([^"]*)" />`, 'u')
  )?.[1];
}

test('production invites crawlers everywhere but the admin', () => {
  assert.equal(
    robotsTxt(production),
    'User-agent: *\nAllow: /\n\nSitemap: https://devopsrockstars.com/sitemap.xml\n'
  );
  const rules = headersFile(production).trimEnd().split('\n\n');
  assert.doesNotMatch(rules[0] ?? '', /X-Robots-Tag/u);
  for (const path of ['/admin', '/admin/*'])
    assert.ok(
      rules.includes(`${path}\n  X-Robots-Tag: noindex, nofollow`),
      path
    );
});

test('staging refuses indexing in the document and headers but stays crawlable', () => {
  // Blocking the crawl would hide the noindex from crawlers.
  assert.equal(robotsTxt(staging), 'User-agent: *\nAllow: /\n');
  assert.match(headersFile(staging), /^ {2}X-Robots-Tag: noindex, nofollow$/mu);
  for (const candidate of [...allPages, notFoundPage]) {
    const head = pageHead(candidate, staging);
    assert.equal(
      tagContent(head, 'name', 'robots'),
      'noindex, nofollow',
      candidate.path
    );
    // A noindexed page never names a URL.
    assert.doesNotMatch(
      head,
      /rel="canonical"|property="og:|ld\+json|https:/u,
      candidate.path
    );
  }
  assert.equal(
    tagContent(pageHead(page('/'), staging), 'name', 'description'),
    page('/').description
  );
});

test('production pages carry their canonical URL and social cards', () => {
  for (const [path, url] of [
    ['/', 'https://devopsrockstars.com/'],
    ['/company', 'https://devopsrockstars.com/company'],
  ] as const) {
    const candidate = page(path);
    const head = pageHead(candidate, production);
    assert.equal(pageUrl(candidate), url);
    assert.ok(head.includes(`<link rel="canonical" href="${url}" />`), path);
    assert.equal(tagContent(head, 'name', 'robots'), undefined, path);
    assert.equal(
      head.match(/<title>([^<]*)<\/title>/u)?.[1],
      pageTitle(candidate)
    );
    assert.equal(
      tagContent(head, 'name', 'description'),
      candidate.description
    );
    assert.equal(tagContent(head, 'property', 'og:url'), url);
    assert.equal(tagContent(head, 'property', 'og:title'), candidate.name);
    assert.equal(
      tagContent(head, 'property', 'og:site_name'),
      'DevOps Rockstars'
    );
    assert.equal(
      tagContent(head, 'name', 'twitter:card'),
      'summary_large_image'
    );
    assert.equal(
      tagContent(head, 'property', 'og:image'),
      'https://devopsrockstars.com/og-image.png'
    );
    assert.equal(tagContent(head, 'property', 'og:image:width'), '1200');
    assert.equal(tagContent(head, 'property', 'og:image:height'), '630');
    assert.ok(tagContent(head, 'property', 'og:image:alt'));
  }
});

test('the home page describes the site and its publisher as JSON-LD', () => {
  const scripts = [
    ...pageHead(page('/'), production).matchAll(
      /<script type="application\/ld\+json">(.*?)<\/script>/gu
    ),
  ];
  assert.equal(scripts.length, 1);
  const data = JSON.parse(scripts[0]?.[1] ?? '');
  assert.deepEqual(
    data['@graph'].map((node: {'@type': string}) => node['@type']),
    ['Organization', 'WebSite']
  );
  assert.doesNotMatch(
    pageHead(page('/company'), production),
    /application\/ld\+json/u
  );
});

test('private and transactional pages are never indexed', () => {
  for (const candidate of [
    ...allPages.filter(({indexable}) => !indexable),
    notFoundPage,
  ]) {
    const head = pageHead(candidate, production);
    assert.equal(
      tagContent(head, 'name', 'robots'),
      'noindex, nofollow',
      candidate.path
    );
    assert.doesNotMatch(head, /rel="canonical"|property="og:|ld\+json/u);
  }
  for (const path of [
    '/admin',
    '/admin/orders',
    '/admin/alerts',
    '/admin/account',
    '/store/checkout',
    '/store/receipt',
  ])
    assert.equal(page(path).indexable, false, path);
});

test('indexable page titles and descriptions are unique and sized for results', () => {
  const indexable = productionPages.filter(({indexable}) => indexable);
  assert.deepEqual(
    indexable.map(({path}) => path),
    ['/', '/company']
  );
  assert.equal(new Set(indexable.map(pageTitle)).size, indexable.length);
  assert.equal(
    new Set(indexable.map(({description}) => description)).size,
    indexable.length
  );
  for (const candidate of indexable) {
    const title = pageTitle(candidate);
    assert.ok(title.length >= 40 && title.length <= 60, title);
    assert.ok(title.endsWith(' | DevOps Rockstars'), title);
    const length = candidate.description?.length ?? 0;
    assert.ok(length >= 120 && length <= 160, candidate.path);
  }
});

test('the pages cover every route the router registers', () => {
  const paths = (pages: readonly Page[]) => pages.map(({path}) => path);
  assert.deepEqual(
    paths(productionPages).filter(path => !path.startsWith('/admin')),
    ['/', '/company']
  );
  assert.ok(paths(allPages).includes('/search'));
  for (const route of storeRoutes) assert.ok(paths(allPages).includes(route));
  assert.deepEqual([...allPages, notFoundPage].map(pageFile), [
    '/index.html',
    '/company.html',
    '/search.html',
    '/store.html',
    '/store/checkout.html',
    '/store/receipt.html',
    '/admin.html',
    '/admin/orders.html',
    '/admin/alerts.html',
    '/admin/account.html',
    '/404.html',
  ]);
});

test('the sitemap lists only indexable canonical URLs', () => {
  assert.equal(
    sitemapXml(productionPages),
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      '  <url><loc>https://devopsrockstars.com/</loc></url>',
      '  <url><loc>https://devopsrockstars.com/company</loc></url>',
      '</urlset>',
      '',
    ].join('\n')
  );
  assert.doesNotMatch(sitemapXml(allPages), /admin|checkout|receipt/u);
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
