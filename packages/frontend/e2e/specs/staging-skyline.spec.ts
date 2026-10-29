import {afterAll, beforeAll, describe, it} from 'bun:test';
import assert from 'node:assert';
import {browser, expect, startBrowser, stopBrowser} from '../browser';
import {Base, BasePage} from '../pageObjects/base';

beforeAll(startBrowser, 60000);
afterAll(stopBrowser, 60000);

const {skylineRegion} = Base;

type SkylineProbe = Window & {
  __skylineProbe?: {
    contexts: (WebGLRenderingContext | WebGL2RenderingContext)[];
    messages: string[];
  };
};

// Records the page's WebGL contexts and console warnings and errors, so tests
// can check that the viewer shares three.js and releases its contexts.
function probeSkyline() {
  return browser.addInitScript(() => {
    const probe: NonNullable<SkylineProbe['__skylineProbe']> = {
      contexts: [],
      messages: [],
    };
    (window as SkylineProbe).__skylineProbe = probe;
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: Parameters<typeof getContext>
    ) {
      const context = getContext.apply(this, args);
      if (
        (context instanceof WebGLRenderingContext ||
          context instanceof WebGL2RenderingContext) &&
        !probe.contexts.includes(context)
      ) {
        probe.contexts.push(context);
      }
      return context;
    } as typeof getContext;
    for (const level of ['warn', 'error'] as const) {
      const log = console[level].bind(console);
      console[level] = (...args: unknown[]) => {
        probe.messages.push(args.map(String).join(' '));
        log(...args);
      };
    }
  });
}

function probedMessages() {
  return browser.execute(
    () => (window as SkylineProbe).__skylineProbe?.messages ?? []
  );
}

async function tapInSkyline(selector: string) {
  const point = await browser.execute(
    (region, target) => {
      const bounds = document
        .querySelector(region)
        ?.shadowRoot?.querySelector(target)
        ?.getBoundingClientRect();
      return bounds
        ? {x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2}
        : null;
    },
    skylineRegion,
    selector
  );
  assert.ok(point, `${selector} must be in the skyline viewer`);
  await browser.sendCommand('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point],
  });
  await browser.sendCommand('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
}

describe('staging 3D skyline', () => {
  it('hides show original while the embedded scene is loading', async () => {
    // Hold the scene markup until the boot-state assertions complete.
    const delayScene = await browser.addInitScript(() => {
      const sceneReady = new Promise<void>(resolve => {
        window.addEventListener('release-skyline-markup', () => resolve(), {
          once: true,
        });
      });
      const originalFetch = globalThis.fetch.bind(globalThis);
      const browserWindow: Window = window;
      browserWindow.fetch = async (input, init) => {
        const url = input instanceof Request ? input.url : String(input);
        if (
          new URL(url, location.href).pathname ===
          '/static/skyline/skyline-3d.html'
        ) {
          document.documentElement.dataset['skylineMarkupHeld'] = 'true';
          await sceneReady;
        }
        return originalFetch(input, init);
      };
    });
    try {
      await BasePage.openStaging('');
      const viewer = await browser.$(skylineRegion);
      await viewer.waitForExist({timeout: 30_000});
      const original = await viewer.shadow$('#embedded-original');
      await original.waitForExist({timeout: 30_000});
      await browser.waitUntil(
        () =>
          browser.execute(
            () =>
              document.documentElement.dataset['skylineMarkupHeld'] === 'true'
          ),
        {
          timeout: 30_000,
          timeoutMsg: 'The scene markup request must be held',
        }
      );
      await expect(viewer).toHaveAttribute('aria-busy', 'true');
      await expect(original).not.toBeDisplayed();
      await browser.execute(() =>
        window.dispatchEvent(new Event('release-skyline-markup'))
      );
      await BasePage.waitForSkylineFrame();
      await expect(original).not.toBeDisplayed();
    } finally {
      try {
        await browser.execute(() =>
          window.dispatchEvent(new Event('release-skyline-markup'))
        );
      } finally {
        await delayScene.remove();
      }
    }
  });

  it('waits for background hat preparation before mounting the viewer', async () => {
    const delayArtwork = await browser.addInitScript(() => {
      const artworkReady = new Promise<void>(resolve => {
        window.addEventListener('release-hat-artwork', () => resolve(), {
          once: true,
        });
      });
      const originalFetch = globalThis.fetch.bind(globalThis);
      const browserWindow: Window = window;
      browserWindow.fetch = async (input, init) => {
        if (String(input).endsWith('/static/image/store/5950.svg')) {
          await artworkReady;
        }
        return originalFetch(input, init);
      };
    });
    try {
      await BasePage.openStaging('');
      await BasePage.waitForAppReady();
      await expect(BasePage.skyline).toExist();
      assert.strictEqual(await browser.$$(skylineRegion).length, 0);
      await browser.execute(() =>
        window.dispatchEvent(new Event('release-hat-artwork'))
      );
      await browser.waitUntil(
        async () =>
          String(
            await browser
              .$('[data-hat-preview-status]')
              .getProperty('textContent')
          ).includes('3D preview ready'),
        {timeout: 20_000}
      );
      await (await browser.$(skylineRegion)).waitForExist({
        timeout: 30_000,
      });
    } finally {
      await browser.execute(() =>
        window.dispatchEvent(new Event('release-hat-artwork'))
      );
      await delayArtwork.remove();
    }
  });

  it('starts the skyline even when background hat preparation times out', async () => {
    const shortenTimeout = await browser.addInitScript(() => {
      const originalSetTimeout = window.setTimeout;
      window.setTimeout = ((...args: Parameters<typeof window.setTimeout>) => {
        const [handler, delay, ...rest] = args;
        return originalSetTimeout(
          handler,
          delay === 15_000 ? 0 : delay,
          ...rest
        );
      }) as typeof window.setTimeout;
    });
    try {
      await BasePage.openStaging('');
      await browser.waitUntil(async () =>
        String(
          await browser
            .$('[data-hat-preview-status]')
            .getProperty('textContent')
        ).includes('3D preview unavailable')
      );
      await (await browser.$(skylineRegion)).waitForExist({
        timeout: 30_000,
      });
    } finally {
      await shortenTimeout.remove();
    }
  });

  it('keeps the original drawing one press away when the 3D skyline cannot start', async () => {
    const probe = await probeSkyline();
    const withoutWebgl = await browser.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        ...args: Parameters<typeof getContext>
      ) {
        return args[0] === 'webgl' || args[0] === 'webgl2'
          ? null
          : getContext.apply(this, args);
      } as typeof getContext;
    });
    try {
      await BasePage.openStaging('');
      await BasePage.waitForAppReady();
      await browser.waitUntil(
        async () =>
          (await probedMessages()).some(message =>
            message.startsWith("The Chicago skyline couldn't start:")
          ),
        {
          timeout: 30_000,
          timeoutMsg: 'The viewer must report that it could not start',
        }
      );
      const viewer = await browser.$(skylineRegion);
      await expect(viewer).toExist();
      await (await viewer.shadow$('#embedded-original')).click();
      const drawing = await viewer.shadow$('#drawing');
      await expect(drawing).toBeDisplayed();
      await browser.waitUntil(() =>
        browser.execute(selector => {
          const image = document
            .querySelector(selector)
            ?.shadowRoot?.querySelector('#drawing');
          return (
            image instanceof HTMLImageElement &&
            image.complete &&
            image.naturalWidth > 0
          );
        }, skylineRegion)
      );
    } finally {
      await withoutWebgl.remove();
      await probe.remove();
    }
  });

  it('renders, keeps controls usable, and cleans up on desktop and mobile navigation', async () => {
    const probe = await probeSkyline();
    try {
      for (const [width, height] of [
        [1280, 900],
        [390, 844],
      ] as const) {
        const mobile = width < 600;
        await browser.sendCommand('Emulation.setDeviceMetricsOverride', {
          width,
          height,
          deviceScaleFactor: 1,
          mobile,
        });
        await browser.sendCommand('Emulation.setTouchEmulationEnabled', {
          enabled: mobile,
        });
        await BasePage.openStaging('');
        await BasePage.waitForAppReady();
        const viewer = await browser.$(skylineRegion);
        await viewer.waitForExist({timeout: 30000});
        await expect(await browser.$('#skyline')).toHaveAttribute(
          'data-ct-app',
          'skyline'
        );
        await expect(viewer).toHaveAttribute(
          'aria-label',
          'Interactive Chicago skyline'
        );
        await BasePage.waitForSkylineFrame();
        // The viewer renders in the page, without frames, fills the viewport,
        // shows its sky through the transparent header, and receives presses
        // outside the header.
        assert.deepStrictEqual(
          await browser.execute(selector => {
            const region = document.querySelector(selector);
            const bounds = region?.getBoundingClientRect();
            const controls = region?.shadowRoot?.querySelector('.control-bar');
            const header = document.querySelector('header') as HTMLElement;
            return {
              bounds: [innerWidth, bounds?.top, bounds?.bottom],
              backdrop: region && getComputedStyle(region).backgroundColor,
              scheme: region && getComputedStyle(region).colorScheme,
              controlsBackdrop:
                controls && getComputedStyle(controls).backgroundColor,
              controlsScheme:
                controls && getComputedStyle(controls).colorScheme,
              frames:
                document.querySelectorAll('iframe').length +
                (region?.shadowRoot?.querySelectorAll('iframe').length ?? 0),
              headerBackdrop: getComputedStyle(header).backgroundColor,
              skyBehindHeader:
                region !== null &&
                document
                  .elementsFromPoint(innerWidth / 2, header.offsetHeight / 2)
                  .includes(region),
              pressTarget:
                document.elementFromPoint(innerWidth / 2, innerHeight / 2) ===
                region,
            };
          }, skylineRegion),
          {
            bounds: [width, 0, height],
            backdrop: 'rgb(0, 0, 0)',
            scheme: 'dark',
            controlsBackdrop: 'rgb(8, 8, 8)',
            controlsScheme: 'dark',
            frames: 0,
            headerBackdrop: 'rgba(0, 0, 0, 0)',
            skyBehindHeader: true,
            pressTarget: true,
          }
        );
        await expect(await viewer.shadow$('canvas#building')).toBeDisplayed();
        const menu = await viewer.shadow$('#menu-toggle');
        if (mobile) await tapInSkyline('#menu-toggle');
        else await menu.click();
        await expect(menu).toHaveAttribute('aria-expanded', 'true');
        const showOriginal = await viewer.shadow$('#show-original');
        await expect(showOriginal).toBeDisplayed();
        await showOriginal.click();
        const scene = await viewer.shadow$('#skyline-3d-scene');
        await expect(scene).not.toBeDisplayed();
        const returnTo3d = await viewer.shadow$('#return-skyline-3d');
        await expect(returnTo3d).toBeDisplayed();
        await returnTo3d.click();
        await expect(scene).toBeDisplayed();
        if (mobile) {
          // The viewer follows viewport height changes, as when browser
          // toolbars collapse.
          await browser.sendCommand('Emulation.setDeviceMetricsOverride', {
            width,
            height: height - 100,
            deviceScaleFactor: 1,
            mobile,
          });
          await browser.waitUntil(() =>
            browser.execute(
              (selector, expected) => {
                const region = document.querySelector(selector);
                const canvas = region?.shadowRoot?.querySelector('#building');
                const bounds = region?.getBoundingClientRect();
                const drawn = canvas?.getBoundingClientRect();
                return (
                  innerHeight === expected &&
                  bounds?.bottom === expected &&
                  drawn !== undefined &&
                  drawn.bottom <= expected + 1
                );
              },
              skylineRegion,
              height - 100
            )
          );
        }
        // The host navigation stays above the viewer and remains clickable.
        await (await browser.$('a[href="/company"]')).click();
        await expect(await browser.$('h1=Contact')).toExist();
        await expect(BasePage.skyline).not.toExist();
        await expect(
          await browser.$(
            '[role="region"][aria-label="Interactive Chicago skyline"]'
          )
        ).not.toExist();
        // Leaving Home releases the viewer's WebGL contexts; the parked hat
        // preview keeps its own.
        const contexts = await browser.execute(() => {
          const all = (window as SkylineProbe).__skylineProbe?.contexts ?? [];
          const detached = all.filter(
            context =>
              !(context.canvas instanceof HTMLCanvasElement) ||
              !context.canvas.isConnected
          );
          return {
            released: detached.filter(context => context.isContextLost())
              .length,
            live: detached.filter(context => !context.isContextLost()).length,
          };
        });
        assert.ok(contexts.released > 0, 'The viewer must release a context');
        assert.strictEqual(contexts.live, 0, 'No detached context stays live');
        await (await browser.$('footer a[href="/"]')).click();
        await (await browser.$(skylineRegion)).waitForExist();
        assert.strictEqual(await browser.$$(skylineRegion).length, 1);
        await BasePage.waitForSkylineFrame();
        // The hat preview and the viewer share the page's three.js: the
        // viewer never loads its own copy, and three.js logs no warnings,
        // such as a second instance or a removed shadow map type.
        assert.deepStrictEqual(
          await browser.execute(() =>
            performance
              .getEntriesByType('resource')
              .map(entry => new URL(entry.name).pathname)
              .filter(pathname =>
                pathname.startsWith('/static/skyline/vendor/')
              )
          ),
          ['/static/skyline/vendor/three-r186.js']
        );
        assert.deepStrictEqual(
          (await probedMessages()).filter(message =>
            // three.js prefixes its warnings with `THREE.`.
            /\bthree\b|skyline/iu.test(message)
          ),
          []
        );
      }
    } finally {
      await probe.remove();
      await browser.sendCommand('Emulation.setTouchEmulationEnabled', {
        enabled: false,
      });
      await browser.sendCommand('Emulation.clearDeviceMetricsOverride', {});
      await browser.setWindowSize(1280, 1000);
    }
  });
});
