---
name: package-update-and-verify
description: Update dependencies in devopsrockstars-frontend and verify project health end-to-end. Use when asked to update all dependencies (or most dependencies), refresh pnpm lockfiles, ensure TypeScript compiles, and confirm tests pass before finishing.
---

# Package Update And Verify

Execute a full dependency refresh workflow and do not declare success until compile/lint/tests are green.

## Workflow

1. Use `pnpm` workflow for this repository.

- Update dependencies with `pnpm up --latest`.
- Keep lockfile and `package.json` in sync.

1. Snapshot current state.

- Record `git status --short`.
- Inspect scripts in `package.json` before running validations.

1. Refresh dependencies.

- Run `pnpm up --latest`.
- Run `pnpm install`.
- If the user asks for stricter scope (for example, no major bumps), honor that scope.

1. Ensure TypeScript compiles.

- Run `pnpm run compile`.
- Fix compile issues introduced by upgrades.

1. Ensure lint passes.

- Run `pnpm run lint`.
- Fix dependency-related lint/config breakages.

1. Ensure tests pass.

- Primary project test path: `pnpm run test-headless` (WebdriverIO headless).
- If broader confidence is needed, also run `pnpm run ci-headless`.
- Fix dependency-related test failures and rerun until green.

1. Report and hand off.

- Summarize updated dependency groups and any notable major-version migrations.
- Report exact verification commands executed and their status.
- List files changed (at minimum `package.json` and `pnpm-lock.yaml`).

## Execution Rules

- Prefer minimal code changes required to restore compatibility after upgrades.
- Do not silently skip failing checks; either fix them or report blockers clearly.
- Keep edits scoped to dependency upgrades and required compatibility changes unless user asks for broader refactors.
