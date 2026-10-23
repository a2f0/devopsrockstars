#!/usr/bin/env bun
import {cp, mkdir, mkdtemp, readdir, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {copySkylineAssets} from '@a2f0/skyline/build';
import {
  type DiagnosticsConfig,
  validConfig,
} from '@devopsrockstars/diagnostics/config';
import {
  headersFile,
  pageFile,
  pageHead,
  robotsTxt,
  sitemapXml,
} from '../buildAssets';
import {parseSiteEnvironment, type SiteEnvironment} from '../src/environment';
import type {FeatureFlags} from '../src/featureFlags';
import {notFoundPage, sitePages} from '../src/pages';
import {loadFeatureFlagConfiguration, parseFeatureFlags} from './featureFlags';

export const frontendRoot = path.resolve(import.meta.dir, '..');
export const repositoryRoot = path.resolve(frontendRoot, '../..');
const outputRoot = path.join(frontendRoot, 'build');

// Adds every file a generator writes to a temporary directory to the build
// under the URL prefix, so no generated file lands in the source tree.
async function addGeneratedAssets(
  assets: Map<string, Blob>,
  prefix: string,
  generate: (directory: string) => Promise<void>
) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'frontend-assets-'));
  try {
    await generate(temporary);
    for (const entry of await readdir(temporary, {
      recursive: true,
      withFileTypes: true,
    })) {
      if (!entry.isFile()) continue;
      const filename = path.join(entry.parentPath, entry.name);
      const url = `${prefix}${path
        .relative(temporary, filename)
        .split(path.sep)
        .join('/')}`;
      if (assets.has(url)) throw new Error(`Duplicate frontend asset ${url}`);
      const file = Bun.file(filename);
      assets.set(url, new Blob([await file.arrayBuffer()], {type: file.type}));
    }
  } finally {
    await rm(temporary, {recursive: true, force: true});
  }
}

// agent-tool renders the favicons target in agent-tool.json from
// assets/brand/logo.svg; the site serves them from its root.
async function renderFavicons(directory: string) {
  const command = Bun.spawn(
    [
      process.execPath,
      path.join(repositoryRoot, 'node_modules/.bin/agent-tool'),
      '--repo',
      repositoryRoot,
      'images',
      'build',
      'favicons',
      '--out',
      directory,
    ],
    {stdin: 'ignore', stdout: 'ignore', stderr: 'pipe'}
  );
  const [exitCode, errors] = await Promise.all([
    command.exited,
    new Response(command.stderr).text(),
  ]);
  if (exitCode)
    throw new Error(`Favicon rendering failed: ${errors.trim() || exitCode}`);
}

export interface FrontendBuildOptions {
  environment?: SiteEnvironment;
  featureFlags?: FeatureFlags;
  storeApiOrigin?: string;
  minify?: boolean;
  diagnostics?: DiagnosticsConfig;
}

export async function bundleFrontend({
  environment = parseSiteEnvironment(process.env['PUBLIC_ENVIRONMENT']),
  featureFlags,
  storeApiOrigin = process.env['STORE_API_ORIGIN'] ?? '',
  minify = true,
  diagnostics,
}: FrontendBuildOptions = {}) {
  if (
    diagnostics &&
    (!validConfig(diagnostics) ||
      diagnostics.runtime !== 'web' ||
      diagnostics.environment !== environment)
  )
    throw new Error('Invalid frontend Sentry configuration');
  const flags = parseFeatureFlags(
    featureFlags ?? (await loadFeatureFlagConfiguration())[environment]
  );
  const result = await Bun.build({
    entrypoints: [path.join(frontendRoot, 'src/index.tsx')],
    target: 'browser',
    format: 'esm',
    splitting: true,
    sourcemap: 'external',
    minify,
    naming: {
      entry: 'assets/[name]-[hash].[ext]',
      chunk: 'assets/chunk-[hash].[ext]',
      asset: 'assets/[name]-[hash].[ext]',
    },
    define: {
      'globalThis.__FEATURE_FLAGS__': JSON.stringify(flags),
      'globalThis.__SITE_ENVIRONMENT__': JSON.stringify(environment),
      'globalThis.__STORE_API_ORIGIN__': JSON.stringify(storeApiOrigin),
      'globalThis.__SENTRY_WEB__': diagnostics
        ? JSON.stringify(diagnostics)
        : 'undefined',
      'process.env.NODE_ENV': JSON.stringify(
        minify ? 'production' : 'development'
      ),
    },
  });
  if (!result.success)
    throw new AggregateError(result.logs, 'Frontend build failed');

  // Dev servers keep their bundles in memory so staging and production can
  // run together without overwriting each other's flags or HTML.
  const assets = new Map<string, Blob>();
  let entry = '';
  for (const output of result.outputs) {
    const url = `/${output.path.replace(/^\.\//u, '')}`;
    assets.set(url, output);
    if (output.kind === 'entry-point') entry = url;
  }
  if (!entry) throw new Error('Frontend build did not emit an entry point');
  const template = await Bun.file(path.join(frontendRoot, 'index.html')).text();
  // Each route gets the same application shell with its own metadata, so
  // crawlers and link previews read it without running JavaScript.
  const pages = sitePages(flags);
  for (const page of [...pages, notFoundPage]) {
    const html = template.replace(
      '</head>',
      `${pageHead(page, environment)}\n<script type="module" src="${entry}"></script>\n</head>`
    );
    assets.set(
      pageFile(page),
      new Blob([html], {type: 'text/html;charset=utf-8'})
    );
  }
  assets.set(
    '/robots.txt',
    new Blob([robotsTxt(environment)], {type: 'text/plain'})
  );
  if (environment === 'production')
    assets.set(
      '/sitemap.xml',
      new Blob([sitemapXml(pages)], {type: 'application/xml'})
    );
  assets.set(
    '/_headers',
    new Blob([headersFile(environment)], {type: 'text/plain'})
  );
  assets.set(
    '/feature-flags.json',
    new Blob([`${JSON.stringify({environment, flags}, null, 2)}\n`], {
      type: 'application/json',
    })
  );
  await addGeneratedAssets(assets, '/static/skyline/', copySkylineAssets);
  await addGeneratedAssets(assets, '/', renderFavicons);
  return assets;
}

export async function writeFrontendBuild(
  options: FrontendBuildOptions = {},
  sourceMapsDirectory?: string,
  destination = outputRoot
) {
  const assets = await bundleFrontend(options);
  // Wrangler uploads this entire directory. Remove every stale environment's
  // bundle before writing the successful build and copying static files.
  await rm(destination, {recursive: true, force: true});
  await mkdir(destination, {recursive: true});
  if (sourceMapsDirectory)
    await rm(sourceMapsDirectory, {recursive: true, force: true});
  for (const [url, contents] of assets) {
    if (
      sourceMapsDirectory &&
      url.startsWith('/assets/') &&
      /\.js(?:\.map)?$/u.test(url)
    )
      await Bun.write(
        path.join(sourceMapsDirectory, url.slice('/assets/'.length)),
        contents
      );
    // Source maps are deployment artifacts, never public static assets.
    if (!url.endsWith('.map'))
      await Bun.write(path.join(destination, url.slice(1)), contents);
  }
  await cp(
    path.join(frontendRoot, 'static'),
    path.join(destination, 'static'),
    {
      recursive: true,
    }
  );
  console.log(`Built ${assets.size} frontend assets in ${destination}`);
  console.log(
    `Feature flags: ${await assets.get('/feature-flags.json')?.text()}`
  );
}

if (import.meta.main) await writeFrontendBuild();
