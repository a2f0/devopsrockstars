const assert = require('assert');

describe('index page', () => {
  it('loads correctly', () => {
    browser.url('http://localhost:8080');
    const title = browser.getTitle();
    assert.strictEqual(title, '\u200E');
    const map = $('#mapdiv');
    assert.strictEqual(map.isDisplayed(), false);
    const skyline = $('#skyline');
    assert.strictEqual(skyline.isDisplayed(), true);
  });
});

describe('company page', () => {
  it('loads correctly', () => {
    browser.url('http://localhost:8080/company');
    const map = $('#mapdiv');
    assert.strictEqual(map.isDisplayed(), false);
    // Make sure an SVG is retrievable.
    // This ID is in the AWS SVG itself.
    const awsSvg = $('#aws');
    assert.strictEqual(awsSvg.isDisplayed(), true);
  });
});

describe('contact page', () => {
  it('loads correctly', () => {
    browser.url('http://localhost:8080/contact');
    const map = $('#mapdiv');
    assert.strictEqual(map.isDisplayed(), true);
  });
});
