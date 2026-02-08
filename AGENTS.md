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
4. Run relevant validation (`pnpm compile`, `pnpm unit`, `pnpm ci-headless` as needed).
5. Commit and push.
6. Reply in each addressed thread via the REST reply endpoint.
7. Resolve threads only when fully addressed.

## Repo Validation Commands

Primary checks in this repo:

- `pnpm run lint:md`
- `pnpm compile`
- `pnpm unit`
- `pnpm ci-headless`

Pre-commit hook entrypoint:

- `sh ./.husky/pre-commit`

## Markdown Linting

Markdown lint is enforced in CI and hooks:

- Script: `pnpm run lint:md`
- Tool: `markdownlint-cli2`
- Config: `.markdownlint-cli2.jsonc`

## Issue Handling

Do not create GitHub issues unless the user explicitly requests it.
