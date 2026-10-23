import {afterAll, beforeAll, describe, it} from 'bun:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {ClickEvent} from '@a2f0/ct-client';
import type {SiteEnvironment} from '../../src/environment';
import {enabledFeatureFlags} from '../../src/featureFlags';
import {browser, startBrowser, stopBrowser} from '../browser';

interface CapturedBatch {
  site: string;
  environment: string;
  events: ClickEvent[];
}
interface FixtureWindow extends Window {
  capturedClicks: CapturedBatch[];
}

beforeAll(startBrowser, 60000);
afterAll(stopBrowser, 60000);

// Exercise the real initializer and published SDK under deployed origins,
// with all fixture responses and collector requests fulfilled in the test.
async function fixture(
  origin: string,
  environment: SiteEnvironment,
  privacy:
    | 'none'
    | 'webdriver'
    | 'gpc'
    | 'dnt'
    | 'extension'
    | 'local' = 'none',
  realSkyline = false
) {
  const bundle = await Bun.build({
    entrypoints: ['tracking-fixture'],
    target: 'browser',
    define: {
      'globalThis.__SITE_ENVIRONMENT__': JSON.stringify(environment),
      'globalThis.__FEATURE_FLAGS__': JSON.stringify(enabledFeatureFlags),
    },
    plugins: [
      {
        name: 'tracking-fixture',
        setup(build) {
          build.onResolve({filter: /^tracking-fixture$/}, () => ({
            path: 'fixture',
            namespace: 'fixture',
          }));
          build.onLoad({filter: /.*/, namespace: 'fixture'}, () => ({
            loader: 'js',
            contents: `
          import {startClickTracking} from ${JSON.stringify(path.join(import.meta.dir, '../../src/clickTracking.ts'))};
          ${realSkyline ? `import {mountSkyline} from ${JSON.stringify(Bun.resolveSync('@a2f0/skyline', path.join(import.meta.dir, '../..')))};` : ''}
          const host = document.querySelector('[data-ct-app="skyline"]');
          ${realSkyline ? `const viewer = mountSkyline(host, {assetsUrl:'/static/skyline/', controls:'open'}); await viewer.ready; document.addEventListener('tracking-stop', () => viewer.destroy());` : `host.attachShadow({mode:'open'}).innerHTML = '<button data-ct="skyline.wireframe">wireframe</button><canvas width="40" height="40"></canvas>';`}
          let stop = startClickTracking();
          document.addEventListener('tracking-stop', () => stop?.());
          document.addEventListener('tracking-restart', () => { stop?.(); stop = startClickTracking(); });
          document.documentElement.dataset.ready = 'true';
        `,
          }));
        },
      },
    ],
  });
  assert.equal(bundle.success, true);
  const script = await bundle.outputs[0]?.text();
  assert.ok(script);
  const html = `<!doctype html><html><body>
    <button id="nav" data-ct="nav.company">company</button>
    <div data-ct-app="skyline" style="width:900px;height:600px"></div>
    <section data-ct-app="store"><button id="checkout" data-ct="store.checkout">checkout</button></section>
    <input id="sensitive" value="private-value">
    <div contenteditable="true" id="editor">private-content</div>
    <div data-ct-ignore><button id="ignored">ignored</button></div>
    <script type="module" src="/fixture.js"></script>
  </body></html>`;
  const assets = new Map<string, {body: string | ArrayBuffer; type: string}>();
  assets.set('/fixture.js', {body: script, type: 'application/javascript'});
  if (realSkyline) {
    const assetsDirectory = path.join(
      path.dirname(
        fileURLToPath(import.meta.resolve('@a2f0/skyline/package.json'))
      ),
      'site'
    );
    for await (const filename of new Bun.Glob('**/*').scan(assetsDirectory)) {
      const file = Bun.file(path.join(assetsDirectory, filename));
      assets.set(`/static/skyline/${filename}`, {
        body: await file.arrayBuffer(),
        type: file.type,
      });
    }
  }
  const pageMock = await browser.mock(`${origin}/**`);
  pageMock.respond(
    request => assets.get(new URL(request.request.url).pathname)?.body ?? html,
    {
      fetchResponse: false,
      headers: request => ({
        'Content-Type':
          assets.get(new URL(request.request.url).pathname)?.type ??
          'text/html',
      }),
    }
  );
  const collector = await browser.mock('https://ct.a2f0.net/**');
  collector.respond('', {fetchResponse: false, statusCode: 204});
  const injected = await browser.addInitScript(mode => {
    const fixtureWindow = window as unknown as FixtureWindow;
    fixtureWindow.capturedClicks = [];
    const fetchOriginal = window.fetch.bind(window);
    fixtureWindow.fetch = async (input, init) => {
      if (String(input).startsWith('https://ct.a2f0.net/')) {
        fixtureWindow.capturedClicks.push(
          JSON.parse(String(init?.body)) as CapturedBatch
        );
        return new Response(null, {status: 204});
      }
      return fetchOriginal(input, init);
    };
    if (mode !== 'webdriver')
      Object.defineProperty(navigator, 'webdriver', {
        value: false,
        configurable: true,
      });
    Object.defineProperty(navigator, 'globalPrivacyControl', {
      value: mode === 'gpc',
      configurable: true,
    });
    Object.defineProperty(navigator, 'doNotTrack', {
      value: mode === 'dnt' ? '1' : '0',
      configurable: true,
    });
    localStorage.removeItem('ct:opt-out');
    if (mode === 'local') localStorage.setItem('ct:opt-out', '1');
    if (mode === 'extension')
      document.addEventListener('DOMContentLoaded', () =>
        document.documentElement.setAttribute('data-ct-disabled', 'true')
      );
  }, privacy);
  const cleanup = async () => {
    try {
      await browser.execute(() =>
        document.dispatchEvent(new Event('tracking-stop'))
      );
      await browser.url('about:blank');
    } finally {
      await Promise.all([
        injected.remove(),
        pageMock.restore(),
        collector.restore(),
      ]);
    }
  };
  try {
    await browser.url(`${origin}/`);
    await browser.waitUntil(
      () =>
        browser.execute(
          () => document.documentElement.dataset['ready'] === 'true'
        ),
      {timeout: 30000}
    );
    return cleanup;
  } catch (error) {
    await cleanup();
    throw error;
  }
}

async function flush() {
  await browser.execute(() => window.dispatchEvent(new Event('pagehide')));
  return browser.execute(
    () => (window as unknown as FixtureWindow).capturedClicks
  );
}

describe('deployed click tracking', () => {
  it('attributes a real Skyline viewer control without a second tracker', async () => {
    const cleanup = await fixture(
      'https://staging.devopsrockstars.com',
      'staging',
      'none',
      true
    );
    try {
      await browser
        .$('[role="region"]')
        .shadow$('[data-ct="skyline.wireframe"]')
        .click();
      const batches = await flush();
      assert.equal(batches.length, 1);
      assert.equal(batches[0]?.events.length, 1);
      assert.equal(batches[0]?.events[0]?.app, 'skyline');
      assert.equal(batches[0]?.events[0]?.label, 'skyline.wireframe');
      const requests = await browser.execute(() =>
        performance
          .getEntriesByType('resource')
          .map(entry => new URL(entry.name).pathname)
      );
      assert.ok(requests.includes('/static/skyline/skyline-viewer.js'));
      assert.ok(
        !requests.some(
          url =>
            url.endsWith('/click-tracking-page.js') ||
            url.endsWith('/vendor/ct-client.js')
        )
      );
    } finally {
      await cleanup();
    }
  });

  for (const [origin, environment] of [
    ['https://devopsrockstars.com', 'production'],
    ['https://www.devopsrockstars.com', 'production'],
    ['https://staging.devopsrockstars.com', 'staging'],
  ] as const) {
    it(`attributes website and shadow Skyline clicks on ${origin}`, async () => {
      const cleanup = await fixture(origin, environment);
      try {
        await browser.$('#nav').click();
        await browser.$('[data-ct-app="skyline"]').shadow$('button').click();
        await browser.$('[data-ct-app="skyline"]').shadow$('canvas').click();
        await browser.execute(() =>
          history.pushState(
            {},
            '',
            '/STORE/receipt/?order=private-order#private-fragment'
          )
        );
        await browser.$('#checkout').click();
        const batches = await flush();
        assert.equal(batches.length, 1);
        assert.equal(batches[0]?.site, 'devopsrockstars');
        assert.equal(batches[0]?.environment, environment);
        assert.deepEqual(
          batches[0]?.events.map(({app, page, label, target}) => ({
            app,
            page,
            label,
            target,
          })),
          [
            {app: 'website', page: '/', label: 'nav.company', target: 'button'},
            {
              app: 'skyline',
              page: '/',
              label: 'skyline.wireframe',
              target: 'button',
            },
            {app: 'skyline', page: '/', label: null, target: 'canvas'},
            {
              app: 'store',
              page: '/store/receipt',
              label: 'store.checkout',
              target: 'button',
            },
          ]
        );
        assert.ok(!JSON.stringify(batches).includes('private-'));
      } finally {
        await cleanup();
      }
    });
  }

  it('keeps SDK exclusions, opt-outs and cleanup effective', async () => {
    const cleanup = await fixture(
      'https://staging.devopsrockstars.com',
      'staging'
    );
    try {
      for (const selector of ['#sensitive', '#editor', '#ignored'])
        await browser.$(selector).click();
      assert.deepEqual(await flush(), []);
      await browser.$('#nav').click();
      await browser.execute(() => {
        localStorage.setItem('ct:opt-out', '1');
        document.dispatchEvent(new Event('ct:opt-out-change'));
      });
      assert.deepEqual(await flush(), []);
      await browser.execute(() => {
        localStorage.removeItem('ct:opt-out');
        document.dispatchEvent(new Event('tracking-stop'));
      });
      await browser.$('#nav').click();
      assert.deepEqual(await flush(), []);
      await browser.execute(() =>
        document.dispatchEvent(new Event('tracking-restart'))
      );
      await browser.$('#nav').click();
      assert.equal((await flush())[0]?.events.length, 1);
    } finally {
      await cleanup();
    }
  });

  it('does not send under browser and extension privacy controls or automation', async () => {
    for (const privacy of [
      'gpc',
      'dnt',
      'extension',
      'local',
      'webdriver',
    ] as const) {
      const cleanup = await fixture(
        'https://devopsrockstars.com',
        'production',
        privacy
      );
      try {
        await browser.$('#nav').click();
        assert.deepEqual(await flush(), [], privacy);
      } finally {
        await cleanup();
      }
    }
  });

  it('refuses local origins and host/environment mismatches', async () => {
    for (const [origin, environment] of [
      ['https://devopsrockstars.com', 'staging'],
      ['https://staging.devopsrockstars.com', 'production'],
      ['http://127.0.0.1:8099', 'production'],
    ] as const) {
      const cleanup = await fixture(origin, environment);
      try {
        await browser.$('#nav').click();
        assert.deepEqual(await flush(), []);
      } finally {
        await cleanup();
      }
    }
  });
});
