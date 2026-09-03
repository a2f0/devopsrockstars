# Agent Tool

This repository-local CLI supports the `ship-pr` workflow with guarded pull
request mutations and cross-agent review.

## Review

Review the current feature branch with a local Claude or Codex CLI:

```bash
pnpm agent-tool solicitClaudeCodeReview
pnpm agent-tool solicitCodexReview
pnpm agent-tool solicitCodexReview xhigh
```

The review base is the open PR's base branch, or the repository default branch
before a PR exists. The tool pins the base and head commits, generates a raw
read-only snapshot of tracked files, treats the diff as untrusted input, and
requires a final `VERDICT:` line. Supported verdicts are `BLOCKER`, `MAJOR`,
`MINOR`, `SUGGESTION`, and `CLEAN`.

The coordinating skill can pin an already-fetched base with
`AGENT_TOOL_REVIEW_BASE_REF` and `AGENT_TOOL_REVIEW_BASE_OID`.

## Open a pull request

The title defaults to the latest commit subject. An explicit title and body can
be supplied as follows:

```bash
pnpm agent-tool openPr 'feat(store): add inventory' <<'EOF'
## Summary

Add inventory handling.
EOF
```

Titles must use the repository's conventional-commit format and be no longer
than 72 characters. The tool refuses to run on the default branch or create a
duplicate open PR.

## Squash merge

The merge action creates a subject-only squash commit. It appends the PR number,
rejects queued or automatic merges, and can bind the mutation to both a reviewed
head SHA and the expected base branch:

```bash
pnpm agent-tool squashMerge '' "$REVIEWED_SHA" "$BASE_REF"
```

GitHub enforces the head SHA atomically through `expectedHeadOid`. GitHub does
not expose an atomic expected-base input, so the tool rechecks the base branch
immediately before the mutation. The surrounding `ship-pr` workflow owns CI,
base freshness, review repair, and post-merge cleanup.
