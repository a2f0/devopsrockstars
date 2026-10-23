import type {SiteEnvironment} from './src/environment';
import {type Page, pageTitle, siteName, siteOrigin} from './src/pages';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// Workers Static Assets' default html_handling serves company.html at
// /company and redirects /company/ to it.
export function pageFile(page: Page) {
  return page.path === '/' ? '/index.html' : `${page.path}.html`;
}

export function pageUrl(page: Page) {
  return new URL(page.path, siteOrigin).href;
}

const homeStructuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${siteOrigin}/#organization`,
      name: siteName,
      url: `${siteOrigin}/`,
    },
    {
      '@type': 'WebSite',
      '@id': `${siteOrigin}/#website`,
      name: siteName,
      url: `${siteOrigin}/`,
      publisher: {'@id': `${siteOrigin}/#organization`},
    },
  ],
};

// Metadata every page carries without JavaScript. The staging site is
// publicly reachable, so it asks crawlers to stay away in each document and
// in a response header. Only indexable production pages name a URL, in
// their canonical link, social cards, and structured data, so a page that
// must stay out of search results never points at one that should rank.
export function pageHead(page: Page, environment: SiteEnvironment) {
  const tags = [`<title>${escapeHtml(pageTitle(page))}</title>`];
  if (page.description)
    tags.push(
      `<meta name="description" content="${escapeHtml(page.description)}" />`
    );
  if (environment !== 'production' || !page.indexable) {
    tags.push('<meta name="robots" content="noindex, nofollow" />');
    return tags.join('\n');
  }
  const url = pageUrl(page);
  tags.push(`<link rel="canonical" href="${url}" />`);
  const social = {
    'og:type': 'website',
    'og:site_name': siteName,
    'og:title': page.name,
    ...(page.description ? {'og:description': page.description} : {}),
    'og:url': url,
  };
  for (const [property, content] of Object.entries(social))
    tags.push(
      `<meta property="${property}" content="${escapeHtml(content)}" />`
    );
  // There is no share image yet, so cards use the small summary layout.
  tags.push('<meta name="twitter:card" content="summary" />');
  if (page.path === '/')
    tags.push(
      `<script type="application/ld+json">${JSON.stringify(
        homeStructuredData
      ).replaceAll('<', '\\u003c')}</script>`
    );
  return tags.join('\n');
}

export function robotsTxt(environment: SiteEnvironment) {
  // Staging must stay crawlable: a crawler that may not fetch a page never
  // sees its noindex, and could still list the bare URL from links.
  return environment === 'production'
    ? `User-agent: *\nAllow: /\n\nSitemap: ${siteOrigin}/sitemap.xml\n`
    : 'User-agent: *\nAllow: /\n';
}

// Production only: staging never offers its pages to search engines.
export function sitemapXml(pages: readonly Page[]) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...pages
      .filter(page => page.indexable)
      .map(page => `  <url><loc>${escapeHtml(pageUrl(page))}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n');
}

// Cloudflare Workers Static Assets reads this file from the build root.
// Everything but the content-hashed bundles has to revalidate, because those
// asset URLs stay the same when their contents change.
export function headersFile(environment: SiteEnvironment) {
  return [
    '/*',
    '  Cache-Control: public, no-cache, must-revalidate',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  X-Content-Type-Options: nosniff',
    ...(environment === 'production'
      ? []
      : ['  X-Robots-Tag: noindex, nofollow']),
    '',
    '/assets/*',
    '  ! Cache-Control',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
    // Staging already refuses crawlers everywhere; production adds the
    // header to the admin's own robots meta tag.
    ...(environment === 'production'
      ? ['/admin', '/admin/*'].flatMap(path => [
          path,
          '  X-Robots-Tag: noindex, nofollow',
          '',
        ])
      : []),
  ].join('\n');
}
