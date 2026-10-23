import {expect, test} from 'bun:test';
import {readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {bundleFrontend} from './build';

test('builds copy every published viewer asset together', async () => {
  const assets = await bundleFrontend({
    environment: 'production',
    featureFlags: {store: false, search: false},
  });
  const site = path.join(
    path.dirname(
      fileURLToPath(import.meta.resolve('@a2f0/skyline/package.json'))
    ),
    'site'
  );
  const expected = (await readdir(site, {recursive: true, withFileTypes: true}))
    .filter(entry => entry.isFile())
    .map(
      entry =>
        `/static/skyline/${path.relative(site, path.join(entry.parentPath, entry.name)).split(path.sep).join('/')}`
    )
    .sort();
  expect(
    [...assets.keys()]
      .filter(name => name.startsWith('/static/skyline/'))
      .sort()
  ).toEqual(expected);
  for (const name of ['skyline-viewer.js', 'viewer.css', 'skyline-3d.js']) {
    expect(
      (await assets.get(`/static/skyline/${name}`)?.text())?.length
    ).toBeGreaterThan(0);
  }
});
