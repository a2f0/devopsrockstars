import assert from 'node:assert';
import {Base, BasePage} from '../pageObjects/base';

describe('staging environment', () => {
  it('hides search and store from the navigation', async () => {
    await BasePage.openStaging('');
    await BasePage.waitForAppReady();

    await expect(await browser.$('a[href="/search"]')).not.toExist();
    await expect(await browser.$('a[href="/store"]')).not.toExist();
    await expect(await browser.$('a[href="/company"]')).toExist();
  });

  it('routes the hidden pages to the not found page', async () => {
    for (const path of ['store', 'store/checkout', 'search']) {
      await BasePage.openStaging(path);
      await BasePage.waitForAppReady();
      await expect(await browser.$('h1=Not found')).toExist();
    }
  });

  it('tells crawlers not to index the document', async () => {
    await BasePage.openStaging('');
    await BasePage.waitForAppReady();

    const robots = await browser.$('meta[name="robots"]');
    assert.strictEqual(
      await robots.getAttribute('content'),
      'noindex, nofollow'
    );
  });

  it('serves a robots.txt that disallows everything', async () => {
    await browser.url(`${Base.stagingOrigin}/robots.txt`);
    const body = await browser.$('body');
    assert.match(await body.getText(), /User-agent: \*\s+Disallow: \//u);
  });
});
