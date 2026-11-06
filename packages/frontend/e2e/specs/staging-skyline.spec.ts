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
    restoration?: WEBGL_lose_context;
  };
};

// Records the page's WebGL contexts and console warnings and errors, so tests
// can check that the viewer shares three.js and retains its contexts.
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
    const draw = WebGL2RenderingContext.prototype.drawElements;
    WebGL2RenderingContext.prototype.drawElements = function (...args) {
      if (this.canvas instanceof HTMLCanvasElement) {
        this.canvas.dataset['drawCalls'] = String(
          Number(this.canvas.dataset['drawCalls'] ?? 0) + 1
        );
      }
      return draw.apply(this, args);
    };
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

async function animationFrames(count: number) {
  await browser.execute(async count => {
    for (let index = 0; index < count; index++) {
      const {promise, resolve} = Promise.withResolvers<void>();
      requestAnimationFrame(() => resolve());
      await promise;
    }
  }, count);
}

function skylineDrawCalls() {
  return browser.execute(
    selector =>
      Number(
        document
          .querySelector(selector)
          ?.shadowRoot?.querySelector<HTMLCanvasElement>('#building')?.dataset[
          'drawCalls'
        ] ?? 0
      ),
    skylineRegion
  );
}

describe('staging 3D skyline', () => {
  it('does not start a skyline on transactional, admin, or missing pages', async () => {
    for (const path of [
      'store/checkout',
      'store/receipt',
      'admin',
      'missing',
    ]) {
      await BasePage.openStaging(path);
      await browser.waitUntil(
        () =>
          browser.execute(() => {
            const status = document.querySelector(
              '[data-hat-preview-status]'
            )?.textContent;
            return status?.includes('ready') || status?.includes('unavailable');
          }),
        {timeout: 30_000, timeoutMsg: 'Hat preparation must settle'}
      );
      await animationFrames(2);
      await expect(await browser.$(skylineRegion)).not.toExist();
      assert.deepEqual(
        await browser.execute(() =>
          performance
            .getEntriesByType('resource')
            .filter(entry =>
              new URL(entry.name).pathname.startsWith('/static/skyline/')
            )
            .map(entry => entry.name)
        ),
        [],
        `${path} must not fetch skyline assets`
      );
    }
    await (await browser.$('footer a[href="/"]')).click();
    await BasePage.waitForSkylineFrame();
    await expect(await browser.$(skylineRegion)).toBeDisplayed();
  });

  it('prepares on Store and retains a paused viewer across round trips', async () => {
    const probe = await probeSkyline();
    try {
      await BasePage.openStaging('store');
      await BasePage.waitForSkylineFrame();
      const viewer = await browser.$(skylineRegion);
      const viewerId = viewer.elementId;
      const canvas = await viewer.shadow$('#building');
      const canvasId = canvas.elementId;
      await expect(BasePage.skyline).not.toBeDisplayed();
      await expect(BasePage.skyline).toHaveAttribute('inert');
      await (await browser.$('footer a[href="/"]')).click();
      await expect(viewer).toBeDisplayed();
      assert.equal((await browser.$(skylineRegion)).elementId, viewerId);
      await expect(viewer).not.toHaveAttribute('aria-busy');
      await (await viewer.shadow$('#menu-toggle')).click();
      await browser.waitUntil(
        () =>
          browser.execute(selector => {
            const controls = document
              .querySelector(selector)
              ?.shadowRoot?.querySelector('.control-bar');
            return (
              controls !== null &&
              controls !== undefined &&
              controls
                .getAnimations({subtree: true})
                .every(animation => animation.playState !== 'running')
            );
          }, skylineRegion),
        {timeout: 30_000, timeoutMsg: 'The controls must finish opening'}
      );
      await (await viewer.shadow$('#wireframe')).click();
      await (await viewer.shadow$('#turntable')).click();
      await (await browser.$('a[href="/store"]')).click();
      await expect(BasePage.skyline).not.toBeDisplayed();
      // Drain pending resize/render callbacks, then prove an enabled turntable
      // does not keep rendering in the background.
      await animationFrames(2);
      const parkedDraws = await skylineDrawCalls();
      assert.ok(parkedDraws > 0, 'The prepared skyline must have drawn');
      await animationFrames(8);
      assert.equal(await skylineDrawCalls(), parkedDraws);
      await expect(await viewer.shadow$('#turntable')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await (await browser.$('footer a[href="/"]')).click();
      await expect(viewer).toBeDisplayed();
      assert.equal(
        (await (await browser.$(skylineRegion)).shadow$('#building')).elementId,
        canvasId
      );
      await expect(viewer).not.toHaveAttribute('aria-busy');
      await expect(await viewer.shadow$('#wireframe')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await browser.waitUntil(
        async () => (await skylineDrawCalls()) > parkedDraws,
        {timeout: 30_000, timeoutMsg: 'The parked turntable must resume'}
      );
    } finally {
      await probe.remove();
    }
  });

  it('restores a lost parked context without replacing the skyline', async () => {
    const probe = await probeSkyline();
    try {
      await BasePage.openStaging('store');
      await BasePage.waitForSkylineFrame();
      const viewer = await browser.$(skylineRegion);
      const canvasId = (await viewer.shadow$('#building')).elementId;
      await browser.execute(selector => {
        const canvas = document
          .querySelector(selector)
          ?.shadowRoot?.querySelector<HTMLCanvasElement>('#building');
        const extension = canvas
          ?.getContext('webgl2')
          ?.getExtension('WEBGL_lose_context');
        if (!extension) throw new Error('WebGL context loss is unavailable');
        (window as SkylineProbe).__skylineProbe!.restoration = extension;
        extension.loseContext();
      }, skylineRegion);
      await browser.waitUntil(
        () =>
          browser.execute(
            selector =>
              document
                .querySelector(selector)
                ?.shadowRoot?.querySelector('#loading')
                ?.textContent?.includes('graphics context was interrupted'),
            skylineRegion
          ),
        {
          timeout: 30_000,
          timeoutMsg: 'The parked skyline must report context loss',
        }
      );
      await browser.execute(() =>
        (window as SkylineProbe).__skylineProbe!.restoration!.restoreContext()
      );
      await BasePage.waitForSkylineFrame();
      const parkedDraws = await skylineDrawCalls();
      await (await browser.$('footer a[href="/"]')).click();
      await expect(viewer).toBeDisplayed();
      assert.equal((await viewer.shadow$('#building')).elementId, canvasId);
      await browser.waitUntil(
        async () => (await skylineDrawCalls()) > parkedDraws,
        {timeout: 30_000, timeoutMsg: 'The restored skyline must draw on Home'}
      );
      assert.equal(
        await browser.execute(
          selector =>
            document
              .querySelector(selector)
              ?.shadowRoot?.querySelector<HTMLCanvasElement>('#building')
              ?.getContext('webgl2')
              ?.isContextLost(),
          skylineRegion
        ),
        false
      );
    } finally {
      await probe.remove();
    }
  });

  it('keeps a pending background load across navigation and hides show original', async () => {
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
      await BasePage.openStaging('store');
      const viewer = await browser.$(skylineRegion);
      await viewer.waitForExist({timeout: 30_000});
      const viewerId = viewer.elementId;
      await expect(viewer).not.toBeDisplayed();
      await (await browser.$('footer a[href="/"]')).click();
      await expect(viewer).toBeDisplayed();
      await (await browser.$('a[href="/store"]')).click();
      await expect(viewer).not.toBeDisplayed();
      await (await browser.$('footer a[href="/"]')).click();
      await expect(viewer).toBeDisplayed();
      assert.equal((await browser.$(skylineRegion)).elementId, viewerId);
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

  it('renders and preserves controls on desktop and mobile navigation', async () => {
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
        const viewerId = viewer.elementId;
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
        await expect(BasePage.skyline).not.toBeDisplayed();
        await expect(viewer).not.toBeDisplayed();
        // Route changes retain the prepared viewer and its WebGL resources.
        assert.ok(
          await browser.execute(selector => {
            const canvas = document
              .querySelector(selector)
              ?.shadowRoot?.querySelector('#building');
            const contexts =
              (window as SkylineProbe).__skylineProbe?.contexts ?? [];
            return (
              contexts.some(context => context.canvas === canvas) &&
              contexts.every(
                context =>
                  context.canvas instanceof HTMLCanvasElement &&
                  context.canvas.isConnected &&
                  !context.isContextLost()
              )
            );
          }, skylineRegion),
          'The parked viewers must retain their connected contexts'
        );
        await (await browser.$('footer a[href="/"]')).click();
        await (await browser.$(skylineRegion)).waitForExist();
        assert.strictEqual(await browser.$$(skylineRegion).length, 1);
        assert.strictEqual(
          (await browser.$(skylineRegion)).elementId,
          viewerId
        );
        await expect(viewer).not.toHaveAttribute('aria-busy');
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
