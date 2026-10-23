import {expect, test} from 'bun:test';
import {mkdtemp, rm} from 'node:fs/promises';
import {SourceMap} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {wranglerDeployCommand} from './deploy';
import {validateSourceMaps} from './sentryMaps';
import {sentryConfig} from './sentryProjects';

test('real workerd captures API failures, retains waitUntil, and emits mappable private frames', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'sentry-worker-'));
  const configuration = {
    ...sentryConfig('staging', 'api', 'c'.repeat(40)),
    dsn: `https://${'a'.repeat(32)}@o1.ingest.us.sentry.io/1`,
  };
  const fixture = path.join(temporary, 'src/index.ts');
  await Bun.write(
    fixture,
    `
    import worker from ${JSON.stringify(path.resolve(import.meta.dir, '../../packages/backend/src/index.ts'))};
    const reports = [];
    const networkFetch = globalThis.fetch;
    export default {async fetch(request, bindings) {
      globalThis.fetch = async (_url, init) => {
        const outbound = new Request(bindings.COLLECTOR_URL, init);
        const response = await networkFetch(bindings.COLLECTOR_URL, init);
        reports.push(await outbound.text()); return response;
      };
      const promises = [];
      const context = {waitUntil(promise) { promises.push(promise); }};
      const env = {DB: {prepare() { throw new Error('PRIVATE_DATABASE_QUERY_AND_TOKEN'); }}};
      const response = await worker.fetch(new Request('https://store-staging.devopsrockstars.com' + new URL(request.url).pathname + '?PRIVATE_ORDER_TOKEN', {headers:{Authorization:'PRIVATE_AUTH'}}), env, context);
      await Promise.all(promises);
      return Response.json({status:response.status, reports, waitUntilCount:promises.length});
    }};
  `
  );
  const bundle = path.join(temporary, 'bundle');
  await Bun.write(
    path.join(temporary, 'wrangler.json'),
    JSON.stringify({
      main: 'src/index.ts',
      name: 'sentry-test',
      compatibility_date: '2026-08-31',
      upload_source_maps: false,
    })
  );
  const result = Bun.spawnSync(
    [
      process.execPath,
      'run',
      '--bun',
      'wrangler',
      'deploy',
      '--config',
      path.join(temporary, 'wrangler.json'),
      '--dry-run',
      '--upload-source-maps',
      '--outdir',
      bundle,
      '--define',
      `globalThis.__SENTRY_API__:${JSON.stringify(configuration)}`,
    ],
    {
      cwd: path.resolve(import.meta.dir, '../..'),
      env: {...process.env, WRANGLER_SEND_METRICS: 'false'},
    }
  );
  if (result.exitCode) throw new Error(result.stderr.toString());
  await validateSourceMaps(bundle);
  const root = path.resolve(import.meta.dir, '../..');
  const staged = path.join(bundle, 'index.js');
  const stagedContents = await Bun.file(staged).text();
  for (const environment of ['prod', 'staging'] as const) {
    const command = wranglerDeployCommand(
      root,
      'backend',
      environment,
      false,
      configuration
    );
    // Exercise the production command against an off-workspace fixture bundle.
    const entry = command.args.indexOf(
      path.join(root, 'build/sentry/api/index.js')
    );
    expect(entry).toBeGreaterThan(-1);
    command.args[entry] = staged;
    const preview = Bun.spawnSync(
      [process.execPath, ...command.args, '--dry-run'],
      {
        cwd: command.cwd,
        env: {...process.env, WRANGLER_SEND_METRICS: 'false'},
      }
    );
    expect(preview.exitCode).toBe(0);
    const output = preview.stdout.toString() + preview.stderr.toString();
    expect(output).not.toContain('No environment found');
    expect(output).toContain('env.CHECKOUT_RATE_LIMITER');
    expect(output).toContain(
      environment === 'prod'
        ? '(devopsrockstars-store)'
        : '(devopsrockstars-store-staging)'
    );
    expect(await Bun.file(staged).text()).toBe(stagedContents);
  }
  const received: string[] = [];
  const collector = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      received.push(await request.text());
      return new Response('');
    },
  });
  const reservation = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () => new Response(),
  });
  const url = reservation.url;
  reservation.stop(true);
  const worker = Bun.spawn(
    [
      process.execPath,
      'run',
      '--no-orphans',
      '--bun',
      'wrangler',
      'dev',
      path.join(bundle, 'index.js'),
      '--config',
      path.join(temporary, 'wrangler.json'),
      '--local',
      '--no-bundle',
      '--var',
      `COLLECTOR_URL:${collector.url.href}`,
      '--port',
      url.port,
      '--inspector-port',
      '0',
      '--log-level',
      'error',
    ],
    {
      cwd: path.resolve(import.meta.dir, '../..'),
      env: {...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false'},
      stdout: 'ignore',
      stderr: 'pipe',
    }
  );
  const log = new Response(worker.stderr).text();
  try {
    let ready = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      if (worker.exitCode !== null) throw new Error(await log);
      try {
        const response = await fetch(url, {signal: AbortSignal.timeout(500)});
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {
        /* Starting. */
      }
      await Bun.sleep(100);
    }
    expect(ready).toBe(true);
    const ignored = await (await fetch(url)).json();
    expect(ignored.status).toBe(404);
    expect(ignored.reports).toEqual([]);
    const response = await (
      await fetch(new URL('/api/storefront', url))
    ).json();
    expect(response.status).toBe(500);
    expect(response.waitUntilCount).toBe(1);
    expect(response.reports).toHaveLength(1);
    expect(received).toEqual(response.reports);
    expect(response.reports[0]).not.toContain('PRIVATE_');
    const event = JSON.parse(response.reports[0].split('\n')[2]);
    expect(event.tags.operation).toBe('storefront');
    const frames = event.exception.values[0].stacktrace.frames;
    expect(frames.length).toBeGreaterThan(0);
    expect(
      frames.every(
        (frame: {filename: string}) => frame.filename === 'app:///index.js'
      )
    ).toBe(true);
    const map = new SourceMap(
      await Bun.file(path.join(bundle, 'index.js.map')).json()
    );
    const mapped = frames.map((frame: {lineno: number; colno: number}) =>
      map.findEntry(frame.lineno - 1, frame.colno - 1)
    );
    expect(
      mapped.some((entry: {originalSource?: string}) =>
        entry.originalSource?.endsWith('catalog.ts')
      )
    ).toBe(true);
  } finally {
    collector.stop(true);
    worker.kill('SIGTERM');
    const timer = setTimeout(() => worker.kill('SIGKILL'), 5000);
    await worker.exited;
    clearTimeout(timer);
    await log;
    await rm(temporary, {recursive: true, force: true});
  }
}, 60000);
