---
name: package-update-and-verify
description: Update dependencies in devopsrockstars and verify project health end-to-end. Use when asked to update all dependencies (or most dependencies), refresh Bun lockfiles, ensure TypeScript compiles, and confirm tests pass before finishing.
---

# Package Update And Verify

Execute a full dependency refresh workflow and do not declare success until compile/lint/tests are green.

## Workflow

1. Use `bun` workflow for this repository.

   - Update dependencies with `bun update --latest --exact`.
   - Keep lockfile and `package.json` in sync.

2. Snapshot current state.

   - Record `git status --short`.
   - Inspect scripts in `package.json` before running validations.

3. Refresh dependencies.

   - Run `bun update --latest --exact`.
   - Run `bun install`.
   - If the user asks for stricter scope (for example, no major bumps), honor that scope.

4. Ensure TypeScript compiles.

   - Run `bun run compile`.
   - Fix compile issues introduced by upgrades.

5. Ensure lint passes.

   - Run `bun run lint`.
   - Fix dependency-related lint/config breakages.

6. Ensure tests pass.

   - Primary project test path: `bun run test-headless` (WebdriverIO headless).
   - If broader confidence is needed, also run `bun run ci-headless`.
   - Fix dependency-related test failures and rerun until green.

7. Report and hand off.

   - Summarize updated dependency groups and any notable major-version migrations.
   - Report exact verification commands executed and their status.
   - List files changed (at minimum `package.json` and `bun.lock`).

## Execution Rules

- Prefer minimal code changes required to restore compatibility after upgrades.
- Do not silently skip failing checks; either fix them or report blockers clearly.
- Keep edits scoped to dependency upgrades and required compatibility changes unless user asks for broader refactors.
