#!/usr/bin/env bun
import {readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';

const exactVersion = /^\d+\.\d+\.\d+(-[\w.]+)?$/;
const unpinned = [];
const manifests = [
  'package.json',
  ...readdirSync('packages', {withFileTypes: true})
    .filter(entry => entry.isDirectory())
    .map(entry => path.join('packages', entry.name, 'package.json')),
];

for (const manifest of manifests) {
  const pkg = JSON.parse(readFileSync(manifest, 'utf8'));

  for (const group of ['dependencies', 'devDependencies']) {
    for (const [name, spec] of Object.entries(pkg[group] ?? {})) {
      if (!exactVersion.test(spec) && spec !== 'workspace:*') {
        unpinned.push(`${manifest}: ${group}/${name}: ${spec}`);
      }
    }
  }
}

if (unpinned.length > 0) {
  console.error('Unpinned dependencies found:');
  for (const entry of unpinned) {
    console.error(`  ${entry}`);
  }
  process.exit(1);
}
console.log('All dependencies are pinned.');
