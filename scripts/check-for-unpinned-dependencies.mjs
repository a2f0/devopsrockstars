#!/usr/bin/env node
import {readFileSync} from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const exactVersion = /^\d+\.\d+\.\d+(-[\w.]+)?$/;
const unpinned = [];

for (const group of ['dependencies', 'devDependencies']) {
  for (const [name, spec] of Object.entries(pkg[group] ?? {})) {
    if (!exactVersion.test(spec)) {
      unpinned.push(`${group}/${name}: ${spec}`);
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
