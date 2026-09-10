import type {SiteFeatures} from './src/environment';

// The staging site is publicly reachable, so it asks crawlers to stay away
// three ways: the document, the robots file, and a response header.
export function robotsMetaTags(features: SiteFeatures) {
  return features.indexable ? {} : {robots: 'noindex, nofollow'};
}

export function robotsTxt(features: SiteFeatures) {
  return features.indexable
    ? 'User-agent: *\nAllow: /\n'
    : 'User-agent: *\nDisallow: /\n';
}

// Cloudflare Workers Static Assets reads this file from the build root.
// Everything but the content-hashed bundles has to revalidate, because those
// asset URLs stay the same when their contents change.
export function headersFile(features: SiteFeatures) {
  return [
    '/*',
    '  Cache-Control: public, no-cache, must-revalidate',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  X-Content-Type-Options: nosniff',
    ...(features.indexable ? [] : ['  X-Robots-Tag: noindex, nofollow']),
    '',
    '/assets/*',
    '  ! Cache-Control',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
  ].join('\n');
}
