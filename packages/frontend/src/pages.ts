import type {FeatureFlags} from './featureFlags';
import {matchesRoute} from './routes';

export const siteName = 'DevOps Rockstars';
// The apex is the primary host. www serves the same Worker, so its pages
// name these URLs as canonical too.
export const siteOrigin = 'https://devopsrockstars.com';

export interface Page {
  // The router path. The build writes each page's own HTML document, which
  // Workers Static Assets serves at this URL without a trailing slash.
  readonly path: string;
  readonly name: string;
  readonly description?: string;
  // Indexable pages carry a canonical URL in production, social cards, and
  // a sitemap entry. The others ask crawlers not to index them everywhere.
  readonly indexable: boolean;
}

// Every route the router can render for these flags, so a reload of any of
// them gets its own document instead of the not-found page.
export function sitePages(flags: FeatureFlags): readonly Page[] {
  return [
    {
      path: '/',
      name: 'Interactive 3D Chicago Skyline',
      description:
        'Explore an interactive 3D model of the Chicago skyline from DevOps Rockstars in your browser, with the original skyline drawing one click away.',
      indexable: true,
    },
    {
      path: '/company',
      name: 'Contact: Email, vCard, and GnuPG Key',
      description:
        "Contact DevOps Rockstars by email, save the company vCard to your address book, or download the company's GnuPG public key.",
      indexable: true,
    },
    ...(flags.search
      ? [{path: '/search', name: 'Search', indexable: true}]
      : []),
    ...(flags.store
      ? [
          {path: '/store', name: 'Store', indexable: true},
          {path: '/store/checkout', name: 'Checkout', indexable: false},
          {path: '/store/receipt', name: 'Order', indexable: false},
        ]
      : []),
    // The admin's nested routes in admin/Admin.tsx.
    ...['/admin', '/admin/orders', '/admin/alerts', '/admin/account'].map(
      path => ({path, name: 'Store admin', indexable: false})
    ),
  ];
}

// Workers Static Assets serves this document, with a 404 status, for every
// path that has no file of its own.
export const notFoundPage: Page = {
  path: '/404',
  name: 'Not found',
  indexable: false,
};

export function pageTitle(page: Page) {
  return `${page.name} | ${siteName}`;
}

// Match like the router, so trailing slashes and unregistered paths agree.
export function pageForPath(pathname: string, flags: FeatureFlags) {
  return (
    sitePages(flags).find(page => matchesRoute([page.path], pathname)) ??
    notFoundPage
  );
}
