import type {SiteEnvironment} from './src/environment';
import {pageHeadTags, pageUrl} from './src/pageHead';
import {type Page, siteOrigin} from './src/pages';

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

// The same tags the application applies on navigation, as HTML for the
// prerendered documents.
export function pageHead(page: Page, environment: SiteEnvironment) {
  return pageHeadTags(page, environment)
    .map(({name, attributes, text}) => {
      const attributeList = Object.entries(attributes)
        .map(([key, value]) => ` ${key}="${escapeHtml(value)}"`)
        .join('');
      if (name === 'meta' || name === 'link')
        return `<${name}${attributeList} />`;
      // Structured data is JSON, so only an early end tag needs escaping.
      const content =
        name === 'script'
          ? (text ?? '').replaceAll('<', '\\u003c')
          : escapeHtml(text ?? '');
      return `<${name}${attributeList}>${content}</${name}>`;
    })
    .join('\n');
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

// Production paths that stay out of search results, on top of any robots
// meta tag in their documents: the admin, and the @a2f0/skyline viewer pages
// and assets the build copies to /static/skyline/, which the package keeps
// out of search on its own host. Naming each path bare and with /* also
// covers the trailing-slash redirects between the two forms.
const productionNoindexPaths = [
  '/admin',
  '/admin/*',
  '/static/skyline',
  '/static/skyline/*',
] as const;

// Cloudflare Workers Static Assets reads this file from the build root.
// Everything but the content-hashed bundles has to revalidate, because those
// asset URLs stay the same when their contents change. A request receives
// the headers of every rule that matches it, so these rules add X-Robots-Tag
// to the /* headers; a second /* rule would replace the first instead.
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
    // Staging already refuses crawlers everywhere, and repeating the header
    // there would send it twice.
    ...(environment === 'production'
      ? productionNoindexPaths.flatMap(path => [
          path,
          '  X-Robots-Tag: noindex, nofollow',
          '',
        ])
      : []),
  ].join('\n');
}
