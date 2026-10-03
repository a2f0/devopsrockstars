import {expect, test} from 'bun:test';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {startFrontendServer} from '../../frontend/tooling/server';

test('Bun runs a real local Worker and proxies browser origin checks', async () => {
  const persistence = await mkdtemp(path.join(tmpdir(), 'bun-worker-test-'));
  const reservation = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () => new Response(),
  });
  const workerUrl = reservation.url;
  reservation.stop(true);
  const frontend = await startFrontendServer({
    port: 0,
    environment: 'staging',
    apiProxy: workerUrl.href,
  });
  const origin = frontend.url.origin;
  const worker = Bun.spawn(
    [
      process.execPath,
      'run',
      '--no-orphans',
      '--bun',
      'wrangler',
      'dev',
      '--env',
      'staging',
      '--local',
      '--port',
      String(workerUrl.port),
      '--inspector-port',
      '0',
      '--persist-to',
      persistence,
      '--var',
      `STOREFRONT_ORIGINS:${origin}`,
      '--log-level',
      'error',
    ],
    {
      cwd: path.resolve(import.meta.dir, '..'),
      env: {...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false'},
      stdout: 'ignore',
      stderr: 'pipe',
    }
  );
  const diagnostics = new Response(worker.stderr).text();
  try {
    // Wrangler's "ready" message alone cannot detect a stuck ProxyWorker.
    // Require an actual HTTP response from workerd before testing the proxy.
    let ready = false;
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      if (worker.exitCode !== null) throw new Error(await diagnostics);
      try {
        const response = await fetch(new URL('/ready', workerUrl), {
          signal: AbortSignal.timeout(750),
        });
        if (response.status === 404) {
          ready = true;
          break;
        }
      } catch {
        /* The runtime is still starting. */
      }
      await Bun.sleep(100);
    }
    expect(ready).toBe(true);
    for (const [endpoint, expectedStatus] of [
      ['/api/checkouts', 400],
      ['/api/orders/10000000-0000-4000-8000-000000000001/cancel', 404],
    ] as const) {
      const response = await fetch(new URL(endpoint, frontend.url), {
        method: 'POST',
        body: '{}',
        signal: AbortSignal.timeout(5000),
        headers: {
          Origin: origin,
          'Sec-Fetch-Site': 'same-origin',
          'X-Order-Token': 'x'.repeat(101),
        },
      });
      // Input/authentication fails before any database or payment mutations.
      expect(response.status).toBe(expectedStatus);
      const body = (await response.json()) as {error: {code: string}};
      expect(body.error.code).toBe(
        expectedStatus === 400 ? 'invalid_checkout_client' : 'order_not_found'
      );
      const blocked = await fetch(new URL(endpoint, frontend.url), {
        method: 'POST',
        body: '{}',
        signal: AbortSignal.timeout(5000),
        headers: {
          Origin: 'https://attacker.example',
          'Sec-Fetch-Site': 'cross-site',
        },
      });
      expect(blocked.status).toBe(403);
      expect(
        ((await blocked.json()) as {error: {code: string}}).error.code
      ).toBe('forbidden');
    }
  } finally {
    frontend.stop();
    worker.kill('SIGTERM');
    const forceStop = setTimeout(() => worker.kill('SIGKILL'), 5000);
    await worker.exited;
    clearTimeout(forceStop);
    await diagnostics;
    await rm(persistence, {recursive: true, force: true});
  }
}, 60000);
