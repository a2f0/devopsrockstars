import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {startFrontendServer} from '../../frontend/tooling/server';

const backend = path.resolve(import.meta.dir, '..');

// Runs the staging store Worker in local workerd with a disposable D1 behind
// the site's development server, which proxies /api like production's split.
export async function startLocalStack({
  prepare,
  vars = {},
}: {
  prepare?: (persistence: string) => Promise<void> | void;
  vars?: Record<string, string>;
} = {}) {
  const persistence = await mkdtemp(path.join(tmpdir(), 'bun-worker-test-'));
  await prepare?.(persistence);
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
      ...Object.entries(vars).flatMap(([name, value]) => [
        '--var',
        `${name}:${value}`,
      ]),
      '--log-level',
      'error',
    ],
    {
      cwd: backend,
      env: {...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false'},
      stdout: 'ignore',
      stderr: 'pipe',
    }
  );
  const diagnostics = new Response(worker.stderr).text();
  const stop = async () => {
    frontend.stop();
    worker.kill('SIGTERM');
    const forceStop = setTimeout(() => worker.kill('SIGKILL'), 5000);
    await worker.exited;
    clearTimeout(forceStop);
    await diagnostics;
    await rm(persistence, {recursive: true, force: true});
  };
  try {
    // Wrangler's "ready" message alone cannot detect a stuck ProxyWorker.
    // Require an actual HTTP response from workerd before testing the proxy.
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      if (worker.exitCode !== null) throw new Error(await diagnostics);
      try {
        const response = await fetch(new URL('/ready', workerUrl), {
          signal: AbortSignal.timeout(750),
        });
        if (response.status === 404)
          return {site: frontend.url, origin, persistence, stop};
      } catch {
        /* The runtime is still starting. */
      }
      await Bun.sleep(100);
    }
    throw new Error('The local Worker did not start');
  } catch (error) {
    await stop();
    throw error;
  }
}

// Wrangler commands against the same disposable local D1 as the Worker.
export function localD1(
  persistence: string,
  command: readonly string[],
  options: readonly string[] = []
) {
  const result = Bun.spawnSync(
    [
      process.execPath,
      'run',
      '--bun',
      'wrangler',
      'd1',
      ...command,
      'devopsrockstars-store-staging',
      '--env',
      'staging',
      '--local',
      '--persist-to',
      persistence,
      ...options,
    ],
    {
      cwd: backend,
      env: {...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false'},
    }
  );
  if (result.exitCode)
    throw new Error(`${result.stdout}${result.stderr}`.slice(-2000));
  return result.stdout.toString();
}
