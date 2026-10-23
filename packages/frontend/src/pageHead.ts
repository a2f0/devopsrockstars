import type {SiteEnvironment} from './environment';
import {type Page, pageTitle, siteName, siteOrigin} from './pages';

export interface HeadTag {
  readonly name: 'title' | 'meta' | 'link' | 'script';
  readonly attributes: Readonly<Record<string, string>>;
  readonly text?: string;
}

const shareImageAlt = 'The DevOps Rockstars six-pointed star on black';

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
      // The favicons target's opaque 180px rendering of the brand logo.
      logo: `${siteOrigin}/apple-touch-icon.png`,
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

// A page's metadata. The build writes it into each page's document, so it
// is present without JavaScript, and the application replaces it on
// client-side navigation. The staging site is publicly reachable, so it asks
// crawlers to stay away in each document and in a response header. Only
// indexable production pages name a URL, in their canonical link, social
// cards, and structured data, so a page that must stay out of search results
// never points at one that should rank.
export function pageHeadTags(
  page: Page,
  environment: SiteEnvironment
): readonly HeadTag[] {
  const tags: HeadTag[] = [
    {name: 'title', attributes: {}, text: pageTitle(page)},
  ];
  if (page.description)
    tags.push({
      name: 'meta',
      attributes: {name: 'description', content: page.description},
    });
  if (environment !== 'production' || !page.indexable) {
    tags.push({
      name: 'meta',
      attributes: {name: 'robots', content: 'noindex, nofollow'},
    });
    return tags;
  }
  const url = pageUrl(page);
  tags.push({name: 'link', attributes: {rel: 'canonical', href: url}});
  const social = {
    'og:type': 'website',
    'og:site_name': siteName,
    'og:title': page.name,
    ...(page.description ? {'og:description': page.description} : {}),
    'og:url': url,
    // Rendered from assets/brand/logo.svg by the social images target.
    'og:image': `${siteOrigin}/og-image.png`,
    'og:image:width': '1200',
    'og:image:height': '630',
    'og:image:alt': shareImageAlt,
  };
  for (const [property, content] of Object.entries(social))
    tags.push({name: 'meta', attributes: {property, content}});
  tags.push({
    name: 'meta',
    attributes: {name: 'twitter:card', content: 'summary_large_image'},
  });
  if (page.path === '/')
    tags.push({
      name: 'script',
      attributes: {type: 'application/ld+json'},
      text: JSON.stringify(homeStructuredData),
    });
  return tags;
}

// Every element pageHeadTags can produce, so navigation removes the previous
// page's metadata, including tags the next page does not carry.
const pageHeadSelector = [
  'title',
  'meta[name="description"]',
  'meta[name="robots"]',
  'link[rel="canonical"]',
  'meta[property^="og:"]',
  'meta[name^="twitter:"]',
  'script[type="application/ld+json"]',
].join(', ');

export function applyPageHead(head: HTMLHeadElement, tags: readonly HeadTag[]) {
  for (const element of head.querySelectorAll(pageHeadSelector))
    element.remove();
  for (const tag of tags) {
    const element = head.ownerDocument.createElement(tag.name);
    for (const [name, value] of Object.entries(tag.attributes))
      element.setAttribute(name, value);
    if (tag.text !== undefined) element.textContent = tag.text;
    head.append(element);
  }
}
