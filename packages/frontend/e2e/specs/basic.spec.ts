import assert from 'node:assert';
import {BasePage} from '../pageObjects/base';

describe('index page', () => {
  it('loads correctly', async () => {
    await BasePage.open('');
    await BasePage.waitForAppReady();
    const title = await browser.getTitle();
    assert.strictEqual(title, '\u200E');
    await expect(BasePage.skyline).toExist();
  });
});

describe('company page', () => {
  it('loads correctly', async () => {
    await BasePage.open('company');
    await BasePage.waitForAppReady();
    await expect(browser).toHaveUrl(expect.stringContaining('/company'));
    await expect(BasePage.skyline).not.toExist();
    await expect(await browser.$('h1=Contact')).toExist();
    const title = await browser.getTitle();
    assert.strictEqual(title, '\u200E');
  });
});

describe('production feature flags', () => {
  it('hides the unlaunched search and store from the navigation', async () => {
    await BasePage.open('');
    await BasePage.waitForAppReady();

    await expect(await browser.$('a[href="/search"]')).not.toExist();
    await expect(await browser.$('a[href="/store"]')).not.toExist();
    await expect(await browser.$('a[href="/company"]')).toExist();
  });

  it('routes the unlaunched pages to the not found page', async () => {
    for (const path of ['search', 'store', 'store/checkout']) {
      await BasePage.open(path);
      await BasePage.waitForAppReady();
      await expect(await browser.$('h1=Not found')).toExist();
    }
  });

  it('invites crawlers', async () => {
    await BasePage.open('');
    await BasePage.waitForAppReady();
    await expect(await browser.$('meta[name="robots"]')).not.toExist();
  });
});
