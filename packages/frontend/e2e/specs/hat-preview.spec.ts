import assert from 'node:assert/strict';
import {BasePage} from '../pageObjects/base';

const canvasSelector = 'canvas[aria-label$="interactive 3D preview"]';
const imageSelector = 'img[alt="DevOps Rockstars 59FIFTY"]';

describe('3D hat preview', () => {
  let fixtures: Awaited<ReturnType<typeof browser.addInitScript>>;

  before(async () => {
    fixtures = await browser.addInitScript(() => {
      const originalFetch = globalThis.fetch.bind(globalThis);
      globalThis.fetch = async (input, init) => {
        if (String(input).endsWith('/api/storefront')) {
          return Response.json({
            products: [
              {
                id: 'hat-5950',
                name: 'DevOps Rockstars 59FIFTY',
                description: 'Fitted, black.',
                imagePath: '/static/image/store/5950.svg',
                variants: [
                  {
                    id: 'hat-small',
                    label: '7',
                    unitAmount: 2000,
                    currency: 'usd',
                    availableQuantity: 1,
                  },
                ],
              },
            ],
          });
        }
        return originalFetch(input, init);
      };
    });
  });

  after(async () => fixtures.remove());

  it('renders a full turn, responds to dragging and keys, and resets', async () => {
    await BasePage.openStaging('store');
    const canvas = await browser.$(canvasSelector);
    await canvas.waitForDisplayed();
    await expect(await browser.$(imageSelector)).not.toBeDisplayed();
    // Compare rendered pixels, so changing UI state without rotating the model
    // cannot satisfy the test. Capture only the canvas to exclude button focus.
    const snapshot = async () =>
      browser.takeElementScreenshot(await canvas.elementId);
    const initial = await snapshot();
    const right = await browser.$('button[aria-label="Rotate hat right"]');
    for (let step = 0; step < 4; step++) await right.click();
    assert.notEqual(await snapshot(), initial);
    for (let step = 0; step < 4; step++) await right.click();
    assert.equal(await snapshot(), initial);

    await canvas.dragAndDrop({x: 90, y: 25}, {duration: 300});
    assert.notEqual(await snapshot(), initial);
    await (await browser.$('button=Reset view')).click();
    assert.equal(await snapshot(), initial);

    await canvas.click();
    const focused = await snapshot();
    await browser.keys('ArrowRight');
    assert.notEqual(await snapshot(), focused);
    await browser.keys('Home');
    assert.equal(await snapshot(), focused);

    const restoreDevice = await browser.emulate('device', 'iPhone 12');
    await expect(canvas).toBeDisplayed();
    const beforeTouch = await snapshot();
    await browser
      .action('pointer', {parameters: {pointerType: 'touch'}})
      .move({origin: canvas, x: 0, y: 0})
      .down({button: 0})
      .move({origin: canvas, x: 70, y: 20, duration: 300})
      .up({button: 0})
      .perform();
    assert.notEqual(await snapshot(), beforeTouch);
    assert.ok(
      await browser.execute(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    );
    await restoreDevice();

    // Navigation tears down the context and controls; returning recreates them.
    await (await browser.$('a[href="/company"]')).click();
    await (await browser.$('a[href="/store"]')).click();
    await expect(await browser.$(canvasSelector)).toBeDisplayed();
  });

  it('keeps the SVG and purchase controls when WebGL is unavailable', async () => {
    const disableWebGL = await browser.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        type,
        ...args
      ) {
        if (type === 'webgl2') {
          document.documentElement.dataset['webglAttempted'] = 'true';
          return null;
        }
        return getContext.call(this, type, ...args);
      } as typeof getContext;
    });
    try {
      await BasePage.openStaging('store');
      await browser.waitUntil(() =>
        browser.execute(
          () => document.documentElement.dataset['webglAttempted'] === 'true'
        )
      );
      await expect(await browser.$(imageSelector)).toBeDisplayed();
      await expect(await browser.$(canvasSelector)).not.toBeDisplayed();
      await (await browser.$('button=Add to cart')).click();
      await expect(
        await browser.$('aside[aria-label="Shopping cart"]')
      ).toExist();
    } finally {
      await disableWebGL.remove();
    }
  });

  it('returns to the SVG if the graphics context is lost', async () => {
    await BasePage.openStaging('store');
    await (await browser.$(canvasSelector)).waitForDisplayed();
    assert.ok(
      await browser.execute(() => {
        const canvas = document.querySelector<HTMLCanvasElement>('canvas');
        const extension = canvas
          ?.getContext('webgl2')
          ?.getExtension('WEBGL_lose_context');
        extension?.loseContext();
        return Boolean(extension);
      })
    );
    await expect(await browser.$(imageSelector)).toBeDisplayed();
    await expect(await browser.$(canvasSelector)).not.toBeDisplayed();
    await expect(await browser.$('button=Reset view')).not.toExist();
  });
});
