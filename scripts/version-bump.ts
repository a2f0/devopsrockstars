#!/usr/bin/env bun
import path from 'node:path';
const root = path.resolve(import.meta.dir, '..');
function git(...arguments_: string[]) {
  const result = Bun.spawnSync(['git', ...arguments_], {cwd: root});
  if (result.exitCode) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}
const repository = Bun.spawnSync(
  [
    'gh',
    'repo',
    'view',
    '--json',
    'defaultBranchRef',
    '-q',
    '.defaultBranchRef.name',
  ],
  {cwd: root}
);
if (repository.exitCode)
  throw new Error('Could not resolve the default branch');
const branch = git('symbolic-ref', '--short', 'HEAD');
if (branch === repository.stdout.toString().trim())
  throw new Error('Bump versions on a feature branch');
if (git('status', '--porcelain'))
  throw new Error('Version bump requires a clean worktree');
const manifest = Bun.file(`${root}/package.json`);
const contents = await manifest.json();
const version = String(contents.version).split('.').map(Number);
if (
  version.length !== 3 ||
  version.some(part => !Number.isInteger(part) || part < 0)
)
  throw new Error('Expected a stable semver version');
contents.version = `${version[0]}.${version[1]}.${(version[2] as number) + 1}`;
await Bun.write(manifest, `${JSON.stringify(contents, null, 2)}\n`);
const html = Bun.file(`${root}/packages/frontend/index.html`);
await Bun.write(
  html,
  (await html.text()).replace(
    /data-version="[^"]*"/u,
    `data-version="${contents.version}"`
  )
);
const installed = Bun.spawnSync(
  [process.execPath, 'install', '--lockfile-only'],
  {cwd: root, stdout: 'inherit', stderr: 'inherit'}
);
if (installed.exitCode) throw new Error('Lockfile refresh failed');
git('add', 'package.json', 'bun.lock', 'packages/frontend/index.html');
git('commit', '-m', `chore: bump version to ${contents.version}`);
console.log(`Version bumped to ${contents.version}`);
