import {expect, test} from 'bun:test';
import {mkdtemp, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {disabledFeatureFlags} from '../src/featureFlags';
import {repositoryRoot, writeFrontendBuild} from './build';

test('builds render the favicons from the brand logo at the site root', async () => {
  const destination = await mkdtemp(path.join(os.tmpdir(), 'favicon-build-'));
  try {
    await writeFrontendBuild(
      {environment: 'production', featureFlags: disabledFeatureFlags},
      undefined,
      destination
    );
    const file = (name: string) => Bun.file(path.join(destination, name));
    expect(await file('favicon.svg').text()).toBe(
      await Bun.file(path.join(repositoryRoot, 'assets/brand/logo.svg')).text()
    );
    const icon = new DataView(await file('favicon.ico').arrayBuffer());
    expect([0, 2, 4].map(offset => icon.getUint16(offset, true))).toEqual([
      0, 1, 3,
    ]);
    expect([0, 1, 2].map(entry => icon.getUint8(6 + entry * 16))).toEqual([
      16, 32, 48,
    ]);
    const touch = new DataView(
      await file('apple-touch-icon.png').arrayBuffer()
    );
    expect(touch.getUint32(0)).toBe(0x89504e47);
    expect([touch.getUint32(16), touch.getUint32(20)]).toEqual([180, 180]);
    // Color type 2 is RGB without alpha, as the opaque output requires.
    expect(touch.getUint8(25)).toBe(2);
    const html = await file('index.html').text();
    for (const tag of [
      '<link rel="icon" href="/favicon.ico" sizes="any" />',
      '<link rel="icon" href="/favicon.svg" type="image/svg+xml" />',
      '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
    ])
      expect(html).toContain(tag);
  } finally {
    await rm(destination, {recursive: true, force: true});
  }
});
