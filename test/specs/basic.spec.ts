import assert from 'assert';

describe('index page', () => {
  it('loads correctly', async () => {
    await browser.url('http://localhost:8081');
    const title = await browser.getTitle();
    assert.strictEqual(title, '\u200E');
    await expect($('#mapdiv')).not.toBeDisplayed();
    await expect($('#skyline')).toBeDisplayed();
  });
});

describe('company page', () => {
  it('loads correctly', async () => {
    await browser.url('http://localhost:8081/company');
    await expect($('#mapdiv')).not.toBeDisplayed();
    await expect($('#aws')).toBeDisplayed();
  });
});

describe('contact page', () => {
  it('loads correctly', async () => {
    await browser.url('http://localhost:8081/contact');
    await expect($('#mapdiv')).toBeDisplayed();
  });
});
