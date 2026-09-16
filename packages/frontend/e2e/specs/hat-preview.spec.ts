import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BasePage} from '../pageObjects/base';

const canvasSelector = 'canvas[aria-label$="interactive 3D preview"]';
const imageSelector = 'img[alt="DevOps Rockstars 59FIFTY"]';

async function saveFailureRenders(renders: Record<string, string>) {
  const directory = join(
    process.env['RUNNER_TEMP'] ?? tmpdir(),
    'hat-preview-failures'
  );
  await mkdir(directory, {recursive: true});
  for (const [name, png] of Object.entries(renders)) {
    await writeFile(join(directory, `${name}.png`), Buffer.from(png, 'base64'));
  }
}

describe('3D hat preview', function () {
  // Rotation and recoloring each construct several independent WebGL scenes.
  // Software shader compilation on CI needs more time than a single page test.
  this.timeout(120_000);
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
    // cannot satisfy the test. Capture only the canvas to exclude page changes.
    const snapshot = async () =>
      browser.takeElementScreenshot(await canvas.elementId);
    const renderState = () =>
      browser.execute(() => {
        const target = document.querySelector('canvas');
        const gl = target?.getContext('webgl2');
        const rect = target?.getBoundingClientRect();
        return {
          density: devicePixelRatio,
          viewport: [innerWidth, innerHeight],
          buffer: gl && [gl.drawingBufferWidth, gl.drawingBufferHeight],
          antialias: gl?.getContextAttributes()?.antialias,
          bounds: rect && [rect.x, rect.y, rect.width, rect.height],
        };
      });
    await canvas.click();
    const initial = await snapshot();
    const initialState = await renderState();
    for (let step = 0; step < 12; step++) await browser.keys('ArrowRight');
    assert.notEqual(await snapshot(), initial);
    for (let step = 0; step < 12; step++) await browser.keys('ArrowRight');
    assert.equal(await snapshot(), initial);

    await canvas.dragAndDrop({x: 90, y: 25}, {duration: 300});
    assert.notEqual(await snapshot(), initial);
    await canvas.click();
    await browser.keys('Home');
    assert.equal(await snapshot(), initial);

    const viewport = await browser.execute(() => ({
      width: innerWidth,
      height: innerHeight,
      devicePixelRatio,
    }));
    const restoreDevice = await browser.emulate('device', 'iPhone 12');
    try {
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
    } finally {
      await restoreDevice();
      // WebdriverIO restores its Desktop Chrome preset, not the viewport
      // from before emulation. Pixel comparisons need the original layout.
      await browser.setViewport(viewport);
    }

    // Navigation tears down the context and controls; returning recreates them.
    await (await browser.$('a[href="/company"]')).click();
    await (await browser.$('a[href="/store"]')).click();
    await expect(await browser.$(canvasSelector)).toBeDisplayed();
    // A fresh page constructs the same textures, pose and render pipeline,
    // even when it reports a different display density at initialization.
    const displayScale = await browser.addInitScript(() => {
      Object.defineProperty(window, 'devicePixelRatio', {value: 3});
    });
    try {
      await BasePage.openStaging('store');
      const recreated = await browser.$(canvasSelector);
      await recreated.waitForDisplayed();
      await recreated.click();
      const recreatedState = await renderState();
      assert.deepEqual(recreatedState.bounds, initialState.bounds);
      const fresh = await browser.takeElementScreenshot(
        await recreated.elementId
      );
      if (fresh !== initial) await saveFailureRenders({initial, fresh});
      assert.ok(
        fresh === initial,
        `A fresh page at another display density must render identically: ${JSON.stringify({initialState, recreatedState})}`
      );
    } finally {
      await displayScale.remove();
    }
  });

  it('renders the white flag on the side and white Batterman on the back', async () => {
    for (const {asset, steps} of [
      {asset: 'new-era-flag.svg', steps: 3},
      {asset: 'mlb-batterman.svg', steps: 12},
    ]) {
      const snapshot = async () => {
        await BasePage.openStaging('store');
        const canvas = await browser.$(canvasSelector);
        await canvas.waitForDisplayed();
        await canvas.click();
        for (let step = 0; step < steps; step++)
          await browser.keys('ArrowRight');
        return browser.takeElementScreenshot(await canvas.elementId);
      };
      const original = await snapshot();
      // Recolor only this asset, then require its white stitches to turn red in
      // the expected view. An omitted badge or a badge on the far side fails.
      const recolor = await browser.addInitScript(asset => {
        const originalFetch = globalThis.fetch.bind(globalThis);
        globalThis.fetch = async (input, init) => {
          const response = await originalFetch(input, init);
          if (String(input).endsWith(`/static/image/store/${asset}`)) {
            return new Response(
              (await response.text()).replaceAll('#f4f4f4', '#ff0000'),
              {headers: {'Content-Type': 'image/svg+xml'}}
            );
          }
          return response;
        };
      }, asset);
      try {
        const recolored = await snapshot();
        const changedStitches = await browser.execute(
          async (original, recolored) => {
            const pixels = async (png: string) => {
              const image = new Image();
              image.src = `data:image/png;base64,${png}`;
              await image.decode();
              const canvas = document.createElement('canvas');
              canvas.width = image.width;
              canvas.height = image.height;
              const context = canvas.getContext('2d');
              if (!context) throw new Error('Could not read the badge pixels.');
              context.drawImage(image, 0, 0);
              return context.getImageData(0, 0, canvas.width, canvas.height)
                .data;
            };
            const before = await pixels(original);
            const after = await pixels(recolored);
            let count = 0;
            for (let i = 0; i < before.length; i += 4) {
              const [r = 0, g = 0, b = 0] = before.slice(i, i + 3);
              const [red = 0, green = 0, blue = 0] = after.slice(i, i + 3);
              if (
                Math.min(r, g, b) > 80 &&
                Math.max(r, g, b) - Math.min(r, g, b) < 30 &&
                red > 100 &&
                red > green * 1.5 &&
                red > blue * 1.5
              ) {
                count++;
              }
            }
            return count;
          },
          original,
          recolored
        );
        if (changedStitches <= 20) {
          await saveFailureRenders({
            [`${asset}-original`]: original,
            [`${asset}-recolored`]: recolored,
          });
        }
        assert.ok(
          changedStitches > 20,
          `${asset} must be visibly embroidered (${changedStitches} matching pixels)`
        );
      } finally {
        await recolor.remove();
      }
    }
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
  });

  it('releases the graphics context and falls back when model construction fails', async () => {
    const malformedArtwork = await browser.addInitScript(() => {
      const originalFetch = globalThis.fetch.bind(globalThis);
      globalThis.fetch = async (input, init) => {
        if (String(input).endsWith('/static/image/store/5950.svg')) {
          // No front logo: fails after the fabric and interior are allocated.
          return new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', {
            headers: {'Content-Type': 'image/svg+xml'},
          });
        }
        return originalFetch(input, init);
      };
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        type,
        ...args
      ) {
        if (type === 'webgl2') {
          this.addEventListener(
            'webglcontextlost',
            () => {
              document.documentElement.dataset['failedBuildContextLost'] =
                'true';
            },
            {once: true}
          );
        }
        return getContext.call(this, type, ...args);
      } as typeof getContext;
    });
    try {
      await BasePage.openStaging('store');
      await browser.waitUntil(() =>
        browser.execute(
          () =>
            document.documentElement.dataset['failedBuildContextLost'] ===
            'true'
        )
      );
      await expect(await browser.$(imageSelector)).toBeDisplayed();
      await expect(await browser.$(canvasSelector)).not.toBeDisplayed();
      await expect(await browser.$('select[aria-label$="size"]')).toBeEnabled();
    } finally {
      await malformedArtwork.remove();
    }
  });

  it('keeps the SVG if either embroidery asset cannot be loaded', async () => {
    for (const asset of ['new-era-flag.svg', 'mlb-batterman.svg']) {
      const failAsset = await browser.addInitScript(asset => {
        const originalFetch = globalThis.fetch.bind(globalThis);
        const originalWarn = console.warn.bind(console);
        let rejected = false;
        console.warn = (...args) => {
          if (rejected && args[0] === 'Using the static hat preview:') {
            document.documentElement.setAttribute('data-failed-artwork', asset);
          }
          originalWarn(...args);
        };
        globalThis.fetch = async (input, init) => {
          if (String(input).endsWith(`/static/image/store/${asset}`)) {
            rejected = true;
            return new Response('', {status: 503});
          }
          return originalFetch(input, init);
        };
      }, asset);
      try {
        await BasePage.openStaging('store');
        await browser.waitUntil(() =>
          browser.execute(
            asset =>
              document.documentElement.getAttribute('data-failed-artwork') ===
              asset,
            asset
          )
        );
        await expect(await browser.$(imageSelector)).toBeDisplayed();
        await expect(await browser.$(canvasSelector)).not.toBeDisplayed();
        await expect(
          await browser.$('select[aria-label$="size"]')
        ).toBeEnabled();
      } finally {
        await failAsset.remove();
      }
    }
  });
});
