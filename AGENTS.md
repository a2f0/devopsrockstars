# Agent Notes

This file is the shared guidance for coding agents working in this repository.
The rule in `.claude/rules/repository.md` points Claude Code here without
maintaining a second copy of the project instructions.

## Repository Identification (Critical)

Never infer repository identity from the folder name. Always resolve the GitHub repo directly:

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
```

Use `-R "$REPO"` (or `--repo "$REPO"`) on `gh` commands when ambiguity is possible.

## Branch and Commit Rules

- Do not commit or push directly to `main`; work on a branch.
- Use conventional commits.
- Do not force-push unless explicitly requested.
- Do not add AI attribution/co-author footers.

## Review Feedback (Critical)

Fix valid findings from pull request review comments, scoped to the feedback,
and run the relevant validation (`bun run compile`, `bun run unit`,
`bun run ci-headless` as needed) before committing and pushing. Then reply in
each original review thread with
`agent-tool pr threads reply <comment-id> --body-file <reply-file>`,
saying what changed and naming the fixing commit. Never reply with top-level PR
comments or `gh pr review`. Resolve a thread only when its finding is fully
addressed.

## Repo Validation Commands

Use the exact-pinned `@a2f0/agent-tool` npm package through
`bun run agent-tool`. Its managed skills in `.agents/skills` and
`.claude/skills` own the PR workflow; `agent-tool.json` supplies title and
required CI policy. Dependency maintenance follows the shared
`update-dependencies` skill and
[deployment preview policy](docs/dependency-maintenance.md). Update installed
skills with `bun run agents:sync` after changing the dependency pin, and check
them with `bun run agents:check`. Do not edit managed skills locally.
`scripts/checks/check-agent-skills-in-sync.mjs` keeps skills present in both
`.agents/skills` and `.claude/skills` identical through the pre-commit hook.

Capture noisy finite commands with the pinned harness, for example
`bun run agent:run --label unit -- bun run unit` or
`bun run agent:run --label hooks -- pre-commit run --all-files`.
It preserves exit status and full private logs while returning a compact receipt
and a bounded failure excerpt. Use `bun run agent-tool logs <log-path>` or a
targeted search to inspect warnings, timings, and artifacts needed to accept a
check. Keep review verdicts and structured decision output visible, and inspect
complete deployment preview evidence before publication. Do not wrap interactive
commands or persistent servers.

Keep README focused on purpose, setup, and normal usage. Maintain reusable upgrade
procedures and active constraints in
[dependency maintenance](docs/dependency-maintenance.md), with operational
runbooks in [deployment operations](docs/deployment.md). Update or remove obsolete
guidance. Put each run's version inventory, audit findings, validation, and preview
evidence in its PR; do not append upgrade journals to README or maintenance docs.

Primary checks in this repo:

- `bun run lint:md`
- `bun run flags:check`
- `bun run compile`
- `bun run unit`
- `bun run ci-headless`
- `bun run agents:check`

Pre-commit hook entrypoint:

- `pre-commit run --all-files`

## Shipping and Production Verification

Use the shared `$ship-pr` skill. Run Markdown lint, compilation, unit tests,
format/lint, and pre-commit checks before shipping; run browser tests locally
when application or browser behavior changes. CI runs the full browser suite.
Integrate changed bases with normal merges and never force-push.

Keep `@a2f0/skyline` on its latest npm release while shipping. Before the first
review, run `bun run skyline:update` on the feature branch. When it moves the
pin, commit `packages/frontend/package.json` and `bun.lock` as
`chore(deps): update @a2f0/skyline to <version>`, run browser tests locally,
include that commit in the reviewed HEAD, and mention the update in the PR
description. A release published after the first review waits for the next
shipped PR. `bun run skyline:check` reports whether the pin is current without
changing it; CI does not run it, so an upstream release never fails a build.
The Home skyline renders with the frontend's `three` through
`@a2f0/skyline/three`, so keep `three` within the skyline's `three` peer range
when updating either; the staging browser tests fail if the viewer loads its
own copy.

Review with an agent other than the one that wrote the change: Codex from
Claude Code, Claude from Codex, then the remaining CLIs, reporting any fallback.
Require a complete non-blocking verdict on the final commit. Validate, commit, and re-review repairs until findings are addressed.
Report the reviewer, fallback, verdict, repair count, and reviewed commit.

Handle review comments on the PR with the reply rules above. Use the shared
exact-head squash helper; invoke `node_modules/.bin/agent-tool pr merge` directly
when passing an empty subject because `bun run` drops empty arguments. Per
`agent-tool.json`, it requires `code-quality` from `Github Actions` on the
reviewed head and refuses to merge unless the `main` ruleset enforces
strict status checks that the merging account cannot bypass.

After merging to `main`, wait for `.github/workflows/main.yml` to deploy
that merge commit successfully. Smoke-test Home and Company at phone and desktop
sizes, and verify navigation, routes, and the Home skyline match the committed
feature flag matrix for each deployed environment. Check the production
storefront API returns JSON. Mobile browser checks should emulate viewport and
touch input, including narrow portrait, landscape, and viewport height changes.
Verify branch identities and merge ancestry before deleting shipped branches.

## Markdown Linting

Markdown lint is enforced in CI and hooks:

- Script: `bun run lint:md`
- Tool: `markdownlint-cli2`
- Config: `.markdownlint-cli2.jsonc`

## Issue Handling

Do not create GitHub issues unless the user explicitly requests it.

## Development and operations guides

Follow [development](docs/development.md) for setup, hook installation, architecture,
and script locations. Use the pinned Bun on PATH in agent shells; do not run
`mise trust`. Keep public package command names stable when moving helpers.
[Feature flags](docs/feature-flags.md) owns rollout configuration and independent
flag coverage. [Deployment operations](docs/deployment.md) owns environments,
analytics, provisioning, and guarded publication. Keep procedures in these guides
and policy here.
