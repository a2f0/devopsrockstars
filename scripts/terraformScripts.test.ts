import {expect, test} from 'bun:test';
import {chmod, mkdir, mkdtemp, readFile, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

const terraformSource = path.resolve(import.meta.dir, '../terraform');

const sharedEnv =
  'export TF_VAR_cloudflare_api_token=fixture-cloudflare-token\n';
// One exported and one plain assignment: neither may reach other commands.
const appEnv =
  'export TF_STATE_ACCESS_KEY_ID=fixture-state-id\n' +
  'TF_STATE_SECRET_ACCESS_KEY=fixture-state-secret\n';

// What Terraform must see: the R2 state key as AWS credentials, no ambient AWS
// profile or session token, and the token from the secrets files.
const terraformEnvironment =
  'fixture-state-id|fixture-state-secret|unset|unset|fixture-cloudflare-token';

type Secrets = {shared?: string; app?: string};

async function readIfPresent(file: string) {
  return (await Bun.file(file).exists()) ? readFile(file, 'utf8') : '';
}

async function runScript(
  script: string,
  {
    response = '',
    checkExit = 0,
    secrets = {shared: sharedEnv, app: appEnv},
  }: {response?: string; checkExit?: number; secrets?: Secrets} = {}
) {
  const root = await mkdtemp(path.join(tmpdir(), 'terraform-scripts-'));
  try {
    const terraform = path.join(root, 'terraform');
    const tier = path.join(root, '.secrets/prod');
    const bin = path.join(root, 'bin');
    const agentBin = path.join(root, 'node_modules/.bin');
    await Promise.all([
      mkdir(terraform),
      mkdir(tier, {recursive: true}),
      mkdir(bin),
      mkdir(agentBin, {recursive: true}),
    ]);
    for (const file of [script, 'env.sh']) {
      await Bun.write(
        path.join(terraform, file),
        await Bun.file(path.join(terraformSource, file)).text()
      );
    }
    if (secrets.shared !== undefined)
      await Bun.write(path.join(tier, 'shared.env'), secrets.shared);
    if (secrets.app !== undefined)
      await Bun.write(path.join(tier, 'app.env'), secrets.app);
    await Bun.write(
      path.join(bin, 'terraform'),
      `#!/bin/sh
printf '%s\\n' "$*" >> "$CALL_LOG"
printf '%s|%s|%s|%s|%s\\n' "\${AWS_ACCESS_KEY_ID-}" "\${AWS_SECRET_ACCESS_KEY-}" \\
  "\${AWS_PROFILE-unset}" "\${AWS_SESSION_TOKEN-unset}" \\
  "\${TF_VAR_cloudflare_api_token-}" >> "$ENV_LOG"
case "$1" in
  plan)
    for arg in "$@"; do
      case "$arg" in -out=*) plan_file=\${arg#-out=};; esac
    done
    printf 'saved plan' > "$plan_file"
    printf 'generated artifact' > "$(dirname "$plan_file")/extra.tmp"
    printf '%s\\n' "$plan_file" > "$PLAN_LOG"
    ;;
  show)
    if [ "$2" = '-json' ]; then printf '{"complete":true}\\n'; else printf 'reviewed plan\\n'; fi
    ;;
esac
`
    );
    await Bun.write(
      path.join(agentBin, 'agent-tool'),
      `#!/bin/sh
printf 'gate\\n' >> "$CALL_LOG"
printf '%s|%s|%s\\n' "\${AWS_ACCESS_KEY_ID-unset}" \\
  "\${TF_STATE_ACCESS_KEY_ID-unset}" "\${TF_STATE_SECRET_ACCESS_KEY-unset}" \\
  >> "$GATE_LOG"
exit "$CHECK_EXIT"
`
    );
    await Promise.all([
      chmod(path.join(bin, 'terraform'), 0o755),
      chmod(path.join(agentBin, 'agent-tool'), 0o755),
    ]);
    const callLog = path.join(root, 'calls.log');
    const envLog = path.join(root, 'env.log');
    const gateLog = path.join(root, 'gate.log');
    const planLog = path.join(root, 'plan.log');
    const env: Record<string, string | undefined> = {
      ...process.env,
      PATH: `${bin}:${process.env['PATH']}`,
      CALL_LOG: callLog,
      ENV_LOG: envLog,
      GATE_LOG: gateLog,
      PLAN_LOG: planLog,
      CHECK_EXIT: String(checkExit),
      AWS_PROFILE: 'ambient-profile',
      AWS_SESSION_TOKEN: 'ambient-session',
      AWS_ACCESS_KEY_ID: 'ambient-id',
      AWS_SECRET_ACCESS_KEY: 'ambient-secret',
      TF_VAR_cloudflare_api_token: 'ambient-token',
    };
    delete env['TF_STATE_ACCESS_KEY_ID'];
    delete env['TF_STATE_SECRET_ACCESS_KEY'];
    const result = Bun.spawnSync(['/bin/bash', path.join(terraform, script)], {
      cwd: root,
      env,
      stdin: Buffer.from(`${response}\n`),
    });
    const plan = (await readIfPresent(planLog)).trim();
    return {
      exitCode: result.exitCode,
      stderr: result.stderr.toString(),
      calls: await readIfPresent(callLog),
      environments: (await readIfPresent(envLog)).trim().split('\n'),
      gate: (await readIfPresent(gateLog)).trim(),
      planRemoved: plan === '' || !(await Bun.file(plan).exists()),
      directoryRemoved:
        plan === '' ||
        (await stat(path.dirname(plan)).then(
          () => false,
          () => true
        )),
    };
  } finally {
    await rm(root, {recursive: true, force: true});
  }
}

test('a rejected Terraform plan cannot reach apply and cleans private files', async () => {
  const result = await runScript('apply.sh', {checkExit: 1, response: 'APPLY'});
  expect(result.exitCode).not.toBe(0);
  expect(result.calls).toContain('gate');
  expect(result.calls).not.toContain('apply ');
  expect(result.planRemoved).toBe(true);
  expect(result.directoryRemoved).toBe(true);
});

test('an unapproved Terraform plan cannot reach apply', async () => {
  const result = await runScript('apply.sh', {response: 'NO'});
  expect(result.exitCode).not.toBe(0);
  expect(result.calls).not.toContain('apply ');
  expect(result.planRemoved).toBe(true);
});

test('an approved checked plan is the only plan passed to apply', async () => {
  const result = await runScript('apply.sh', {response: 'APPLY'});
  expect(result.exitCode).toBe(0);
  expect(result.calls).toContain('apply ');
  expect(result.planRemoved).toBe(true);
  expect(result.directoryRemoved).toBe(true);
});

test('only Terraform receives the R2 state key', async () => {
  const result = await runScript('apply.sh', {response: 'APPLY'});
  expect(result.exitCode).toBe(0);
  expect(result.environments).toHaveLength(4);
  for (const environment of result.environments)
    expect(environment).toBe(terraformEnvironment);
  expect(result.gate).toBe('ambient-id|unset|unset');
});

test('init and upgrade read the committed backend without migrating state', async () => {
  for (const [script, command] of [
    ['init.sh', 'init -input=false -reconfigure'],
    ['upgrade.sh', 'init -input=false -reconfigure -upgrade'],
  ] as const) {
    const result = await runScript(script);
    expect(result.exitCode).toBe(0);
    expect(result.calls).toBe(`${command}\n`);
    expect(result.environments).toEqual([terraformEnvironment]);
  }
});

test('destroy loads the same credentials', async () => {
  const result = await runScript('destroy.sh');
  expect(result.exitCode).toBe(0);
  expect(result.calls).toBe('destroy -var-file=main.tfvars\n');
  expect(result.environments).toEqual([terraformEnvironment]);
});

test('app.env wins over shared.env, and shared.env is optional', async () => {
  const override = `${appEnv}TF_VAR_cloudflare_api_token=fixture-cloudflare-token\n`;
  for (const secrets of [
    {shared: sharedEnv.replace('fixture-', 'stale-'), app: override},
    {app: override},
  ]) {
    const result = await runScript('init.sh', {secrets});
    expect(result.exitCode).toBe(0);
    expect(result.environments).toEqual([terraformEnvironment]);
  }
});

test('missing secrets stop every script before Terraform runs', async () => {
  for (const script of ['init.sh', 'upgrade.sh', 'apply.sh', 'destroy.sh']) {
    const missingFile = await runScript(script, {
      response: 'APPLY',
      secrets: {shared: sharedEnv},
    });
    expect(missingFile.exitCode).not.toBe(0);
    expect(missingFile.stderr).toContain('.secrets/prod/app.env is missing');
    expect(missingFile.calls).toBe('');

    const missingValues = await runScript(script, {
      response: 'APPLY',
      secrets: {app: 'TF_STATE_ACCESS_KEY_ID=fixture-state-id\n'},
    });
    expect(missingValues.exitCode).not.toBe(0);
    expect(missingValues.stderr).toContain('TF_STATE_SECRET_ACCESS_KEY');
    expect(missingValues.stderr).not.toContain('TF_STATE_ACCESS_KEY_ID');
    expect(missingValues.calls).toBe('');
  }
});

test('the installed agent-tool rejects a saved plan with a delete action', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'terraform-plan-check-'));
  try {
    const plan = path.join(root, 'plan.json');
    await Bun.write(
      plan,
      JSON.stringify({
        format_version: '1.2',
        terraform_version: '1.14.0',
        complete: true,
        planned_values: {},
        configuration: {},
        resource_changes: [
          {
            address: 'cloudflare_workers_script.existing',
            mode: 'managed',
            change: {actions: ['delete']},
          },
        ],
      })
    );
    const cli = path.resolve(
      import.meta.dir,
      '../node_modules/.bin/agent-tool'
    );
    const result = Bun.spawnSync([
      cli,
      'dependencies',
      'check-terraform-plan',
      plan,
    ]);
    expect(result.exitCode).toBe(1);
    const verdict = JSON.parse(result.stdout.toString()) as {
      ok: boolean;
      issues: string[];
    };
    expect(verdict.ok).toBe(false);
    expect(verdict.issues.join(' ')).toContain(
      'deletion or replacement is forbidden'
    );
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
