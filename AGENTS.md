# Agent Notes (Codex)

This file is for Codex guidance in this repository.

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

## PR Review Thread Replies (Critical)

When addressing Gemini or reviewer feedback:

- Always reply inside the original review thread.
- Never use top-level PR comments for review feedback replies.
- Never use `gh pr review` to reply to individual review comments.
- Use the PR comment reply endpoint:
  - `POST /repos/{owner}/{repo}/pulls/comments/{comment_id}/replies`
- Tag `@gemini-code-assist` in replies intended for Gemini.
- Include what changed and the commit SHA when relevant.

## Addressing Gemini Feedback Workflow

1. Determine repo and PR number for the current branch.
2. Fetch unresolved review threads (`reviewThreads`) and prioritize Gemini comments.
3. Implement fixes scoped to valid feedback.
4. Run relevant validation (`bun run compile`, `bun run unit`, `bun run ci-headless` as needed).
5. Commit and push.
6. Reply in each addressed thread via the REST reply endpoint.
7. Resolve threads only when fully addressed.

## Repo Validation Commands

Use the commit-pinned shared `agent-tool` package through `bun run agent-tool`.
Its managed skills in `.agents/skills` and `.claude/skills` own the PR workflow;
`agent-tool.json` supplies title and required CI policy. Update installed skills
with `bun run agents:sync` after changing the dependency pin, and check them
with `bun run agents:check`. Do not edit managed skills locally.

Primary checks in this repo:

- `bun run lint:md`
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

For Codex use Claude as the independent reviewer, falling back to the independent
Codex CLI if unavailable. Require a complete non-blocking verdict on the final
commit. Validate, commit, and re-review repairs until findings are addressed.
Report the reviewer, fallback, verdict, repair count, and reviewed commit.

Allow Gemini at least 60 seconds after opening or updating a PR, then fetch
unresolved review threads and follow the reply rules above. Require the
`code-quality` check from `Github Actions` to pass on the reviewed head and
retain the production branch's strict required-check protection. Use the shared
exact-head squash helper; invoke `node_modules/.bin/agent-tool pr merge` directly
when passing an empty subject because `bun run` drops empty arguments.

After merging to `production`, wait for `.github/workflows/main.yml` to deploy
that merge commit successfully. Smoke-test Home and Company, confirm store and
search remain hidden, and check the production storefront API returns JSON.
Verify branch identities and merge ancestry before deleting shipped branches.

## Markdown Linting

Markdown lint is enforced in CI and hooks:

- Script: `bun run lint:md`
- Tool: `markdownlint-cli2`
- Config: `.markdownlint-cli2.jsonc`

## Issue Handling

Do not create GitHub issues unless the user explicitly requests it.
