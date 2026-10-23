import {afterAll, beforeAll, expect, test} from 'bun:test';
import path from 'node:path';
import {browser, startBrowser, stopBrowser} from '../browser';

beforeAll(startBrowser, 60000);
afterAll(stopBrowser, 60000);

test('browser errors and React failures send private reports only on the matching deployed origin', async () => {
  const result = await Bun.build({
    entrypoints: ['sentry-fixture'],
    target: 'browser',
    format: 'esm',
    minify: true,
    plugins: [
      {
        name: 'sentry-fixture',
        setup(build) {
          build.onResolve({filter: /^sentry-fixture$/}, () => ({
            path: 'fixture',
            namespace: 'fixture',
          }));
          build.onLoad({filter: /.*/, namespace: 'fixture'}, () => ({
            loader: 'js',
            contents: `
        import {configureBrowserDiagnostics} from ${JSON.stringify(path.resolve(import.meta.dir, '../../../diagnostics/src/browser.ts'))};
        import React from ${JSON.stringify(Bun.resolveSync('react', path.resolve(import.meta.dir, '../..')))};
        import {createRoot} from ${JSON.stringify(Bun.resolveSync('react-dom/client', path.resolve(import.meta.dir, '../..')))};
        const diagnostics = configureBrowserDiagnostics({dsn:'https://${'a'.repeat(32)}@o1.ingest.us.sentry.io/1', environment:'staging', runtime:'web', release:'devopsrockstars-web@${'b'.repeat(40)}'});
        document.querySelector('#error').onclick = () => { throw new Error('PRIVATE_ERROR_TEXT'); };
        document.querySelector('#rejection').onclick = () => { Promise.reject(new Error('PRIVATE_REJECTION_TEXT')); };
        function Broken() { throw new Error('PRIVATE_REACT_TEXT'); }
        document.querySelector('#react').onclick = () => createRoot(document.querySelector('#root'), {onUncaughtError: error => diagnostics?.capture(error, 'react')}).render(React.createElement(Broken));
        document.querySelector('#flush').onclick = async () => { await diagnostics?.flush(); document.documentElement.dataset['flushed'] = 'true'; };
        document.documentElement.dataset['ready'] = 'true';
      `,
          }));
        },
      },
    ],
  });
  expect(result.success).toBe(true);
  const script = await result.outputs[0]?.text();
  if (!script) throw new Error('No fixture script');
  for (const origin of [
    'https://staging.devopsrockstars.com',
    'https://devopsrockstars.com',
    'http://127.0.0.1:8099',
  ]) {
    const fixture = await browser.mock(`${origin}/**`);
    fixture.respond(
      request =>
        new URL(request.request.url).pathname.endsWith('.js')
          ? script
          : '<!doctype html><button id="error">error</button><button id="rejection">reject</button><button id="react">react</button><button id="flush">flush</button><div id="root"></div><script type="module" src="/assets/index-abc123.js"></script>',
      {
        fetchResponse: false,
        headers: request => ({
          'Content-Type': new URL(request.request.url).pathname.endsWith('.js')
            ? 'application/javascript'
            : 'text/html',
        }),
      }
    );
    const injection = await browser.addInitScript(() => {
      const reports: {
        body: string;
        credentials: string | undefined;
        referrerPolicy: string | undefined;
      }[] = [];
      Object.assign(window, {sentryReports: reports});
      const original = window.fetch.bind(window);
      window.fetch = (async (input, init) => {
        if (String(input).startsWith('https://o1.ingest.us.sentry.io/')) {
          reports.push({
            body: String(init?.body),
            credentials: init?.credentials,
            referrerPolicy: init?.referrerPolicy,
          });
          return new Response('', {status: 200});
        }
        return original(input, init);
      }) as typeof window.fetch;
    });
    try {
      await browser.url(
        `${origin}/store/receipt?token=PRIVATE_QUERY#PRIVATE_FRAGMENT`
      );
      await browser.waitUntil(() =>
        browser.execute(
          () => document.documentElement.dataset['ready'] === 'true'
        )
      );
      await browser.$('#error').click();
      await browser.$('#rejection').click();
      await browser.$('#react').click();
      await browser.$('#flush').click();
      await browser.waitUntil(() =>
        browser.execute(
          () => document.documentElement.dataset['flushed'] === 'true'
        )
      );
      const reports = await browser.execute(
        () =>
          (
            window as unknown as {
              sentryReports: {
                body: string;
                credentials: string;
                referrerPolicy: string;
              }[];
            }
          ).sentryReports
      );
      expect(reports.length).toBe(
        origin === 'https://staging.devopsrockstars.com' ? 3 : 0
      );
      for (const report of reports) {
        expect(report.body).not.toContain('PRIVATE_');
        expect(report.credentials).toBe('omit');
        expect(report.referrerPolicy).toBe('no-referrer');
        const event = JSON.parse(report.body.split('\n')[2] ?? '{}');
        expect(event.release).toBe(`devopsrockstars-web@${'b'.repeat(40)}`);
        expect(event.exception.values[0].stacktrace.frames[0].filename).toBe(
          'app:///assets/index-abc123.js'
        );
      }
    } finally {
      await browser.url('about:blank');
      await injection.remove();
      await fixture.restore();
    }
  }
}, 120000);
