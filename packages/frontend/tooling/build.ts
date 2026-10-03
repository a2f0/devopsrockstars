#!/usr/bin/env bun
import {cp, mkdir, mkdtemp, readdir, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {copySkylineAssets} from 'chicago-skyline/build';
import {headersFile, robotsMetaTags, robotsTxt} from '../buildAssets';
import {parseSiteEnvironment, siteFeatures} from '../src/environment';

export const frontendRoot = path.resolve(import.meta.dir, '..');
const outputRoot = path.join(frontendRoot, 'build');

export async function bundleFrontend({
  environment = parseSiteEnvironment(process.env['PUBLIC_ENVIRONMENT']),
  storeApiOrigin = process.env['STORE_API_ORIGIN'] ?? '',
  minify = true,
} = {}) {
  const result = await Bun.build({
    entrypoints: [path.join(frontendRoot, 'src/index.tsx')],
    target: 'browser',
    format: 'esm',
    splitting: true,
    sourcemap: 'external',
    minify,
    naming: 'assets/[name]-[hash].[ext]',
    define: {
      'globalThis.__SITE_ENVIRONMENT__': JSON.stringify(environment),
      'globalThis.__STORE_API_ORIGIN__': JSON.stringify(storeApiOrigin),
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
  const features = siteFeatures(environment);
  const meta = Object.entries(robotsMetaTags(features))
    .map(([name, content]) => `<meta name="${name}" content="${content}" />`)
    .join('\n');
  const template = await Bun.file(path.join(frontendRoot, 'index.html')).text();
  const html = template.replace(
    '</head>',
    `${meta}\n<script type="module" src="${entry}"></script>\n</head>`
  );
  assets.set(
    '/index.html',
    new Blob([html], {type: 'text/html;charset=utf-8'})
  );
  assets.set(
    '/robots.txt',
    new Blob([robotsTxt(features)], {type: 'text/plain'})
  );
  assets.set(
    '/_headers',
    new Blob([headersFile(features)], {type: 'text/plain'})
  );
  if (features.skyline3d) {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'skyline-assets-'));
    try {
      await copySkylineAssets(temporary);
      for (const entry of await readdir(temporary, {
        recursive: true,
        withFileTypes: true,
      })) {
        if (!entry.isFile()) continue;
        const filename = path.join(entry.parentPath, entry.name);
        const relative = path
          .relative(temporary, filename)
          .split(path.sep)
          .join('/');
        const file = Bun.file(filename);
        assets.set(
          `/static/skyline/${relative}`,
          new Blob([await file.arrayBuffer()], {type: file.type})
        );
      }
    } finally {
      await rm(temporary, {recursive: true, force: true});
    }
  }
  return assets;
}

if (import.meta.main) {
  const assets = await bundleFrontend();
  // Wrangler uploads this entire directory. Remove every stale environment's
  // bundle before writing the successful build and copying static files.
  await rm(outputRoot, {recursive: true, force: true});
  await mkdir(outputRoot, {recursive: true});
  for (const [url, contents] of assets)
    await Bun.write(path.join(outputRoot, url.slice(1)), contents);
  await cp(path.join(frontendRoot, 'static'), path.join(outputRoot, 'static'), {
    recursive: true,
  });
  console.log(`Built ${assets.size} frontend assets in ${outputRoot}`);
}
