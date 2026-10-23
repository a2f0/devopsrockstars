import {mkdtemp, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {SentryCli} from '@sentry/cli';
import type {DiagnosticsConfig} from '../../packages/diagnostics/src/config';

export async function validateSourceMaps(directory: string) {
  const entries = await readdir(directory);
  const scripts = entries.filter(name => name.endsWith('.js'));
  if (!scripts.length)
    throw new Error('Sentry source maps: no JavaScript bundles');
  for (const script of scripts) {
    const map = await Bun.file(path.join(directory, `${script}.map`)).json();
    if (
      map.version !== 3 ||
      !Array.isArray(map.sources) ||
      !map.sources.length ||
      !Array.isArray(map.sourcesContent) ||
      map.sourcesContent.length !== map.sources.length ||
      map.sourcesContent.some(
        (source: unknown) => typeof source !== 'string'
      ) ||
      typeof map.mappings !== 'string' ||
      !map.mappings
    )
      throw new Error(`Sentry source maps: incomplete ${script}.map`);
  }
}

export async function uploadSourceMaps(
  directory: string,
  config: DiagnosticsConfig,
  token: string
) {
  if (!token)
    throw new Error('Configured Sentry deployments require SENTRY_AUTH_TOKEN');
  await validateSourceMaps(directory);
  // Use the pinned binary with no inherited CLI config, environment overrides,
  // dotenv files, or shell. Only this process receives the upload credential.
  const temporary = await mkdtemp(
    path.join(tmpdir(), 'devopsrockstars-sentry-')
  );
  try {
    const result = Bun.spawnSync(
      [
        SentryCli.getPath(),
        '--url',
        'https://us.sentry.io/',
        'sourcemaps',
        'upload',
        '--org',
        'tearleads',
        '--project',
        `devopsrockstars-${config.runtime}-${config.environment}`,
        '--release',
        config.release,
        '--dist',
        config.environment,
        '--url-prefix',
        config.runtime === 'web' ? 'app:///assets' : 'app:///',
        '--validate',
        '--strict',
        directory,
      ],
      {
        cwd: temporary,
        env: {
          HOME: temporary,
          SENTRY_AUTH_TOKEN: token,
          SENTRY_LOAD_DOTENV: '0',
          SENTRY_DISABLE_UPDATE_CHECK: '1',
        },
        stdout: 'inherit',
        stderr: 'inherit',
      }
    );
    if (result.exitCode)
      throw new Error('Sentry source map upload failed; deployment held');
  } finally {
    await rm(temporary, {recursive: true, force: true});
  }
}
