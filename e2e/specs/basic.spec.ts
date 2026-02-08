import assert from 'node:assert';
import {BasePage} from '../pageObjects/base';

describe('index page', () => {
  it('loads correctly', async () => {
    await BasePage.open('');
    const title = await browser.getTitle();
    assert.strictEqual(title, '\u200E');
    await expect(browser).toHaveUrl(
      expect.stringContaining('http://localhost:8081/')
    );
  });
});

describe('company page', () => {
  it('loads correctly', async () => {
    await BasePage.open('company');
    await expect(browser).toHaveUrl(expect.stringContaining('/company'));
    const title = await browser.getTitle();
    assert.strictEqual(title, '\u200E');
  });
});
