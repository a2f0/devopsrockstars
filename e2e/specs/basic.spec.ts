import {BasePage} from '../pageObjects/base';
import assert from 'assert';

describe('index page', () => {
  it('loads correctly', async () => {
    await BasePage.open('');
    const title = await browser.getTitle();
    assert.strictEqual(title, '\u200E');
    await expect(BasePage.mapDiv).not.toBeDisplayed();
    await expect(BasePage.skyline).toBeDisplayed();
  });
});

describe('company page', () => {
  it('loads correctly', async () => {
    await BasePage.open('company');
    await expect(BasePage.skyline).not.toBeDisplayed();
  });
});
