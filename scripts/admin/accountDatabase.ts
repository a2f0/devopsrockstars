import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import type {PlatformProxy} from 'wrangler';
import type {D1Database} from '../../packages/backend/src/types';

export type AccountTarget = 'local' | 'staging' | 'prod';

// Wrangler owns the OAuth credentials; this never reads or prints them.
export async function withAccountDatabase<T>(
  target: AccountTarget,
  work: (db: D1Database) => Promise<T>
): Promise<T> {
  const backend = path.resolve(import.meta.dir, '../../packages/backend');
  const config = Bun.JSONC.parse(
    await Bun.file(path.join(backend, 'wrangler.jsonc')).text()
  ) as {
    compatibility_date: string;
    env: Record<string, {d1_databases: Record<string, unknown>[]}>;
  };
  // Local accounts go to the database `bun run dev:cloudflare` uses.
  const database =
    config.env[target === 'local' ? 'staging' : target]?.d1_databases[0];
  if (!database) throw new Error('Missing D1 configuration');
  const directory = await mkdtemp(path.join(tmpdir(), 'admin-account-'));
  // Wrangler debug logs may include adapter details. Disable disk and console
  // logging before loading its runtime, even if the operator enabled debugging.
  const logging = {
    WRANGLER_WRITE_LOGS: 'false',
    WRANGLER_LOG: 'none',
    WRANGLER_LOG_SANITIZE: 'true',
    WRANGLER_SEND_METRICS: 'false',
  };
  const previous = new Map(
    Object.keys(logging).map(key => [key, process.env[key]])
  );
  Object.assign(process.env, logging);
  let proxy: PlatformProxy<{DB: D1Database}> | undefined;
  try {
    const {getPlatformProxy} = await import('wrangler');
    const configPath = path.join(directory, 'wrangler.json');
    await writeFile(
      configPath,
      JSON.stringify({
        name: 'devopsrockstars-admin-account-cli',
        compatibility_date: config.compatibility_date,
        d1_databases: [
          {
            ...database,
            migrations_dir: undefined,
            remote: target !== 'local',
          },
        ],
      }),
      {mode: 0o600}
    );
    proxy = await getPlatformProxy<{DB: D1Database}>({
      configPath,
      envFiles: [],
      remoteBindings: target !== 'local',
      persist:
        target === 'local'
          ? {path: path.join(backend, '.wrangler/state/v3')}
          : false,
    });
    return await work(proxy.env.DB);
  } finally {
    try {
      await proxy?.dispose();
      await rm(directory, {recursive: true, force: true});
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }
}
