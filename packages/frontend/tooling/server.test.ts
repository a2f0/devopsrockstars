import {afterAll, beforeAll, expect, test} from 'bun:test';
import {startFrontendServer} from './server';

const upstream = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  async fetch(request) {
    return Response.json(
      {
        method: request.method,
        path: new URL(request.url).pathname,
        query: new URL(request.url).search,
        body: await request.text(),
      },
      {status: 201, headers: {'X-API': 'proxied'}}
    );
  },
});
let production: Awaited<ReturnType<typeof startFrontendServer>>;
let staging: typeof production;
beforeAll(async () => {
  production = await startFrontendServer({
    port: 0,
    environment: 'production',
    apiProxy: upstream.url.href,
  });
  staging = await startFrontendServer({
    port: 0,
    environment: 'staging',
    apiProxy: upstream.url.href,
  });
}, 30000);
afterAll(() => {
  production?.stop();
  staging?.stop();
  upstream.stop(true);
});

test('simultaneous environments serve isolated HTML, hashed modules and robots rules', async () => {
  for (const [server, indexable] of [
    [production, true],
    [staging, false],
  ] as const) {
    const page = await fetch(new URL('/store/receipt', server.url));
    const html = await page.text();
    expect(html.includes('noindex, nofollow')).toBe(!indexable);
    expect(page.headers.has('X-Robots-Tag')).toBe(!indexable);
    const entry = html.match(/src="(\/assets\/[^"]+\.js)"/u)?.[1];
    expect(entry).toBeDefined();
    const module = await fetch(new URL(entry as string, server.url));
    expect(module.status).toBe(200);
    expect(module.headers.get('Content-Type')).toContain('javascript');
    const robots = await (
      await fetch(new URL('/robots.txt', server.url))
    ).text();
    expect(robots).toContain(indexable ? 'Allow: /' : 'Disallow: /');
  }
});

test('static assets have correct MIME types and missing files never become HTML', async () => {
  const svg = await fetch(
    new URL('/static/image/white-star-only.svg', production.url)
  );
  expect(svg.status).toBe(200);
  expect(svg.headers.get('Content-Type')).toContain('image/svg+xml');
  const head = await fetch(
    new URL('/static/image/white-star-only.svg', production.url),
    {method: 'HEAD'}
  );
  expect(head.status).toBe(200);
  expect(await head.text()).toBe('');
  for (const pathname of [
    '/assets/missing.js',
    '/static/missing',
    '/static/%2e%2e%2fpackage.json',
  ]) {
    expect((await fetch(new URL(pathname, production.url))).status).toBe(404);
  }
  expect(
    (await fetch(new URL('/', production.url), {method: 'POST'})).status
  ).toBe(405);
});

test('API proxy preserves method, body, query, response status and headers', async () => {
  const response = await fetch(new URL('/api/checkout?test=1', staging.url), {
    method: 'POST',
    body: 'order',
  });
  expect(response.status).toBe(201);
  expect(response.headers.get('X-API')).toBe('proxied');
  expect(await response.json()).toEqual({
    method: 'POST',
    path: '/api/checkout',
    query: '?test=1',
    body: 'order',
  });
});
