#!/usr/bin/env bun
import path from 'node:path';
// Publish the store API before the website that calls it. Custom domains are
// managed by Terraform; deployments only publish Workers and static assets.
const [environment, ...flags] = process.argv.slice(2);
if (
  !['staging', 'prod'].includes(environment ?? '') ||
  flags.some(flag => !['--dry-run', '--skip-migrations'].includes(flag))
)
  throw new Error(
    'Usage: bun scripts/deploy.ts <staging|prod> [--dry-run] [--skip-migrations]'
  );
const env = {
  ...process.env,
  PUBLIC_ENVIRONMENT: environment === 'staging' ? 'staging' : 'production',
  STORE_API_ORIGIN:
    environment === 'staging'
      ? 'https://store-staging.devopsrockstars.com'
      : 'https://store.devopsrockstars.com',
  WRANGLER_SEND_METRICS: 'false',
};
const root = path.resolve(import.meta.dir, '..');
function run(arguments_: string[], cwd = root) {
  const result = Bun.spawnSync([process.execPath, ...arguments_], {
    cwd,
    env,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (result.exitCode !== 0) process.exit(result.exitCode || 1);
}
run(['run', 'compile']);
run(['run', '--filter', '@devopsrockstars/frontend', 'build']);
if (!flags.includes('--dry-run') && !flags.includes('--skip-migrations'))
  run([
    'run',
    '--filter',
    '@devopsrockstars/backend',
    `db:migrate:${environment}`,
  ]);
for (const workspace of ['backend', 'frontend'])
  run(
    [
      'run',
      '--bun',
      'wrangler',
      'deploy',
      '--env',
      environment as string,
      ...(flags.includes('--dry-run') ? ['--dry-run'] : []),
    ],
    `${root}/packages/${workspace}`
  );
console.log(`Cloudflare deployment completed (${environment}).`);
