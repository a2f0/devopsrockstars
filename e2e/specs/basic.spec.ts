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

describe('search page', () => {
  it('shows the original search frontend', async () => {
    await BasePage.open('search');
    await BasePage.waitForAppReady();

    const logo = await browser.$(
      'img[src="/static/image/devopsrockstars-solr.svg"]'
    );
    await expect(logo).toBeDisplayed();

    const searchInput = await browser.$('input[aria-label="Search"]');
    await searchInput.setValue('continuous delivery');
    await browser.keys('Enter');

    await expect(await browser.$('[role="status"]')).toHaveText(
      'Search results are not connected yet. Stay tuned.'
    );
  });
});
