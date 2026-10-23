import {afterAll, beforeAll, describe, it} from 'bun:test';
import assert from 'node:assert';
import {browser, expect, startBrowser, stopBrowser} from '../browser';
import {Base, BasePage} from '../pageObjects/base';

beforeAll(startBrowser, 60000);
afterAll(stopBrowser, 60000);

async function expectNoHatPreparation() {
  await expect(
    await browser.$('canvas[aria-label$="interactive 3D preview"]')
  ).not.toExist();
  await expect(await browser.$('[data-hat-preview-status]')).not.toExist();
  assert.deepStrictEqual(
    await browser.execute(() =>
      performance
        .getEntriesByType('resource')
        .filter(
          entry =>
            new URL(entry.name).pathname === '/static/image/store/5950.svg'
        )
        .map(entry => entry.name)
    ),
    [],
    'Production must not fetch the hat embroidery artwork'
  );
}

describe('index page', () => {
  it('loads correctly', async () => {
    await BasePage.open('');
    await BasePage.waitForAppReady();
    assert.strictEqual(
      await browser.getTitle(),
      'Interactive 3D Chicago Skyline | DevOps Rockstars'
    );
    await expect(await browser.$('h1=DevOps Rockstars')).toExist();
    await expect(BasePage.skyline).toHaveAttribute('data-ct-app', 'skyline');
    // Production starts the interactive 3D skyline directly, without waiting
    // for a hat preview, and renders its first frame.
    await expect(await browser.$(Base.skylineRegion)).toHaveAttribute(
      'aria-label',
      'Interactive Chicago skyline'
    );
    await BasePage.waitForSkylineFrame();
    assert.strictEqual(await BasePage.headerBackground(), 'rgba(0, 0, 0, 0)');
    await expectNoHatPreparation();
  });
});

describe('company page', () => {
  it('loads correctly', async () => {
    await BasePage.open('company');
    await BasePage.waitForAppReady();
    await expect(browser).toHaveUrl(expect.stringContaining('/company'));
    await expect(BasePage.skyline).not.toExist();
    await expect(await browser.$('h1=Contact')).toExist();
    assert.strictEqual(
      await browser.execute(() =>
        document
          .querySelector('h1')
          ?.closest('[data-ct-app]')
          ?.getAttribute('data-ct-app')
      ),
      'company'
    );
    // Content scrolls beneath the sticky header away from the skyline.
    assert.strictEqual(await BasePage.headerBackground(), 'rgb(0, 0, 0)');
    assert.strictEqual(
      await browser.getTitle(),
      'Contact: Email, vCard, and GnuPG Key | DevOps Rockstars'
    );
    await expectNoHatPreparation();
  });

  it('keeps the title in step with client-side navigation', async () => {
    await BasePage.open('');
    await BasePage.waitForAppReady();
    // A full page load would read the prerendered title instead.
    await browser.execute(() => {
      document.documentElement.dataset['navigated'] = 'client';
    });
    await (await browser.$('a[href="/company"]')).click();
    await (await browser.$('h1=Contact')).waitForExist();
    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) ===
        'Contact: Email, vCard, and GnuPG Key | DevOps Rockstars',
      {timeoutMsg: 'Navigating to company must update the title'}
    );
    await browser.back();
    await browser.waitUntil(
      async () =>
        (await browser.getTitle()) ===
        'Interactive 3D Chicago Skyline | DevOps Rockstars',
      {timeoutMsg: 'Returning home must restore the title'}
    );
    assert.strictEqual(
      await browser.execute(
        () => document.documentElement.dataset['navigated']
      ),
      'client'
    );
  });

  it('links the repository with logos flush to the bottom', async () => {
    await BasePage.open('company');
    await BasePage.waitForAppReady();
    assert.strictEqual(
      await BasePage.repositoryLink.getAttribute('href'),
      'https://github.com/a2f0/devopsrockstars.com'
    );
    const {company, repository} = await BasePage.footerLogoGaps();
    assert.ok(Math.abs(company) < 1, `Company logo is ${company}px up`);
    assert.ok(
      Math.abs(repository - 6) < 1,
      `GitHub mark is ${repository}px up, not on the logo baseline`
    );
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
      await expect(BasePage.repositoryLink).not.toExist();
      assert.strictEqual(
        await browser.getTitle(),
        'Not found | DevOps Rockstars'
      );
    }
  });

  it('invites crawlers to the canonical production pages', async () => {
    for (const [path, canonical] of [
      ['', 'https://devopsrockstars.com/'],
      ['company', 'https://devopsrockstars.com/company'],
    ] as const) {
      await BasePage.open(path);
      await BasePage.waitForAppReady();
      await expect(await browser.$('meta[name="robots"]')).not.toExist();
      assert.strictEqual(
        await browser.$('link[rel="canonical"]').getAttribute('href'),
        canonical
      );
      assert.strictEqual(
        await browser.$('meta[property="og:url"]').getAttribute('content'),
        canonical
      );
    }
  });
});
