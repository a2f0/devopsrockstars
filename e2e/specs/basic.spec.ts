import assert from 'node:assert';
import {BasePage} from '../pageObjects/base';

async function waitForAppReady() {
  const companyLink = await browser.$('a[href="/company"]');
  await companyLink.waitForExist({timeout: 30000});
}

describe('index page', () => {
  it('loads correctly', async () => {
    await BasePage.open('');
    await waitForAppReady();
    const title = await browser.getTitle();
    assert.strictEqual(title, '\u200E');
    await expect(BasePage.skyline).toExist();
  });
});

describe('company page', () => {
  it('loads correctly', async () => {
    await BasePage.open('company');
    await waitForAppReady();
    await expect(browser).toHaveUrl(expect.stringContaining('/company'));
    await expect(BasePage.skyline).not.toExist();
    await expect(await browser.$('h1=Contact')).toExist();
    const title = await browser.getTitle();
    assert.strictEqual(title, '\u200E');
  });
});
