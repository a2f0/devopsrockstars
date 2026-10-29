import {afterAll, beforeAll, describe, it} from 'bun:test';
import assert from 'node:assert';
import {browser, expect, startBrowser, stopBrowser} from '../browser';
import {Base, BasePage} from '../pageObjects/base';

beforeAll(startBrowser, 60000);
afterAll(stopBrowser, 60000);

describe('staging environment', () => {
  it('keeps search and store in the navigation for testing', async () => {
    await BasePage.openStaging('');
    await BasePage.waitForAppReady();

    await expect(await browser.$('a[href="/search"]')).toExist();
    await expect(await browser.$('a[href="/store"]')).toExist();
    await expect(await browser.$('a[href="/company"]')).toExist();
  });

  it('links the repository from the company and store footers only', async () => {
    for (const [path, linked] of [
      ['company', true],
      ['store', true],
      ['company/', true],
      ['store/checkout', true],
      ['store/missing', false],
      ['search', false],
      ['missing', false],
    ] as const) {
      await BasePage.openStaging(path);
      await BasePage.waitForAppReady();
      const link = BasePage.repositoryLink;
      await (linked ? expect(link).toExist() : expect(link).not.toExist());
    }
  });

  it('underlines only the navigation link for the current page', async () => {
    for (const [path, underlined] of [
      ['', []],
      ['company', ['/company']],
      ['store', ['/store']],
      ['store/checkout', ['/store']],
      ['search', ['/search']],
      ['company/', ['/company']],
      ['missing', []],
      ['company/missing', []],
      ['store/missing', []],
    ] as const) {
      await BasePage.openStaging(path);
      await BasePage.waitForAppReady();
      assert.deepStrictEqual(
        await BasePage.underlinedNavLinks(),
        underlined,
        `/${path}`
      );
    }
  });

  it('tells crawlers not to index any document', async () => {
    for (const path of ['', 'company', 'store', 'missing']) {
      await BasePage.openStaging(path);
      await BasePage.waitForAppReady();

      const robots = await browser.$('meta[name="robots"]');
      assert.strictEqual(
        await robots.getAttribute('content'),
        'noindex, nofollow',
        `/${path}`
      );
      await expect(await browser.$('link[rel="canonical"]')).not.toExist();
      await expect(await browser.$('meta[property="og:url"]')).not.toExist();
    }
  });

  it('lets crawlers fetch pages so they see the noindex', async () => {
    await browser.url(`${Base.stagingOrigin}/robots.txt`);
    const body = await browser.$('body');
    const robots = await body.getText();
    assert.match(robots, /User-agent: \*\s+Allow: \//u);
    assert.doesNotMatch(robots, /Disallow|Sitemap/u);
  });
});

describe('search page', () => {
  it('shows the original search frontend', async () => {
    await BasePage.openStaging('search');
    await BasePage.waitForAppReady();

    const logo = await browser.$(
      'img[src="/static/image/devopsrockstars-solr.svg"]'
    );
    await expect(logo).toBeDisplayed();

    await expect(await browser.$('form')).toHaveAttribute(
      'data-ct-app',
      'search'
    );
    const searchInput = await browser.$('input[aria-label="Search"]');
    await searchInput.setValue('continuous delivery');
    await browser.keys('Enter');

    await expect(await browser.$('[role="status"]')).toHaveText(
      'Search results are not connected yet. Stay tuned.'
    );
  });
});
