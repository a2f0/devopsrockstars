const assert = require('assert');

describe('index page', () => {
  it('loads correctly', () => {
    browser.url('http://localhost:8080');
    const title = browser.getTitle();
    assert.strictEqual(title, 'DevOpsRockstars');
    const map = $('#mapdiv')
    assert.strictEqual(map.isDisplayed(), false);        
  });
});

describe('contact page', () => {
  it('loads correctly', () => {
    browser.url('http://localhost:8080/contact');
    const map = $('#mapdiv')
    assert.strictEqual(map.isDisplayed(), true);       
  });
});