import {expect, test} from 'bun:test';
import {mkdtemp, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {
  bundleFrontend,
  writeFrontendBuild,
} from '../../packages/frontend/tooling/build';
import {guardedDeployment} from './deploy';
import {uploadSourceMaps, validateSourceMaps} from './sentryMaps';
import {sentryConfig} from './sentryProjects';

test('staging and production use distinct web and API projects tied to the deployment commit', () => {
  const configs = (['staging', 'production'] as const).flatMap(env =>
    (['web', 'api'] as const).map(runtime =>
      sentryConfig(env, runtime, 'a'.repeat(40))
    )
  );
  expect(new Set(configs.map(config => config.dsn)).size).toBe(4);
  expect(() => sentryConfig('production', 'api', 'main')).toThrow();
});

test('the production bundle includes only explicit public diagnostics configuration', async () => {
  const token = process.env['SENTRY_AUTH_TOKEN'];
  process.env['SENTRY_AUTH_TOKEN'] = 'PRIVATE_UPLOAD_TOKEN_SENTINEL';
  try {
    const diagnostics = sentryConfig('staging', 'web', 'a'.repeat(40));
    const assets = await bundleFrontend({environment: 'staging', diagnostics});
    const scripts = await Promise.all(
      [...assets]
        .filter(([name]) => name.endsWith('.js'))
        .map(([, asset]) => asset.text())
    );
    expect(scripts.join('')).toContain(diagnostics.dsn);
    expect(scripts.join('')).toContain(diagnostics.release);
    expect(scripts.join('')).not.toContain('PRIVATE_UPLOAD_TOKEN_SENTINEL');
    await expect(
      bundleFrontend({environment: 'production', diagnostics})
    ).rejects.toThrow('Invalid frontend Sentry');
  } finally {
    if (token === undefined) delete process.env['SENTRY_AUTH_TOKEN'];
    else process.env['SENTRY_AUTH_TOKEN'] = token;
  }
});

test('source map validation rejects missing maps and uploads require credentials', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sentry-test-'));
  try {
    await Bun.write(path.join(directory, 'index.js'), 'throw new Error()');
    await expect(validateSourceMaps(directory)).rejects.toThrow();
    await Bun.write(
      path.join(directory, 'index.js.map'),
      JSON.stringify({
        version: 3,
        sources: ['index.ts'],
        sourcesContent: [null],
        mappings: 'AAAA',
      })
    );
    await expect(validateSourceMaps(directory)).rejects.toThrow('incomplete');
    await expect(
      uploadSourceMaps(
        directory,
        sentryConfig('staging', 'web', 'a'.repeat(40)),
        ''
      )
    ).rejects.toThrow('SENTRY_AUTH_TOKEN');
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('real frontend builds keep complete source maps private and remove stale public maps', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sentry-build-'));
  const output = path.join(directory, 'public');
  const maps = path.join(directory, 'private');
  try {
    await Bun.write(path.join(output, 'stale.js.map'), 'private source');
    await writeFrontendBuild(
      {
        environment: 'staging',
        diagnostics: sentryConfig('staging', 'web', 'a'.repeat(40)),
      },
      maps,
      output
    );
    expect(
      (await readdir(output, {recursive: true})).some(name =>
        name.endsWith('.map')
      )
    ).toBe(false);
    await validateSourceMaps(maps);
    expect((await readdir(maps)).some(name => name.endsWith('.js.map'))).toBe(
      true
    );
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('upload failure and artifact changes prevent publication; previews never upload', async () => {
  let published = false;
  let uploads = 0;
  let inputs = 'original';
  const operations = {
    build: async () => {},
    bundle: async () => {},
    inspect: async () => 'identities',
    inputs: async () => inputs,
    prepare: async (): Promise<void> => {
      uploads++;
      throw new Error('upload failed');
    },
    publish: async () => {
      published = true;
    },
  };
  await expect(guardedDeployment(operations)).rejects.toThrow('upload failed');
  expect(published).toBe(false);
  await guardedDeployment(operations, {dryRun: true});
  expect(uploads).toBe(1);
  operations.prepare = async () => {
    inputs = 'changed';
  };
  await expect(guardedDeployment(operations)).rejects.toThrow(
    'inputs changed during source map upload'
  );
  expect(published).toBe(false);
  inputs = 'original';
  let identities = 'original';
  operations.inspect = async () => identities;
  operations.prepare = async () => {
    identities = 'changed during upload';
  };
  await expect(guardedDeployment(operations)).rejects.toThrow(
    'live resource identities changed'
  );
  expect(published).toBe(false);
});
