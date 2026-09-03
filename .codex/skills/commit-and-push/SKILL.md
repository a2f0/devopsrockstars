---
name: commit-and-push
description: Commit local changes and push to the remote for devopsrockstars using conventional commits. Use when you need to commit and push work, create or update a PR, and handle Gemini feedback in PR review threads.
---

# Commit and Push

Commit changes, push the branch, create a PR if needed, and handle initial Gemini review.

## Setup

Determine repository + branch context for all `gh` commands:

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
DEFAULT_BRANCH=$(gh repo view -R "$REPO" --json defaultBranchRef -q .defaultBranchRef.name)
CURRENT_BRANCH=$(git branch --show-current)
```

Always pass `-R "$REPO"` to `gh` commands.

## Workflow

1. Check branch:
   - If `CURRENT_BRANCH` equals `DEFAULT_BRANCH` (often `production` in this repo), create/switch to a feature branch before committing.
   - Do not commit directly on the default branch.

2. Analyze changes:
   - Run `git status --short` and `git diff --staged` to confirm what will be committed.
   - If tooling reports actions but `git status` shows no unexpected changes, proceed without asking about generated files.

3. Run validation for this repo before committing:
   - `pnpm run compile`
   - `pnpm run lint`
   - `pnpm run test-headless` when UI behavior changed or test-sensitive code is touched

4. Commit format:
   - Use a conventional commit message.
   - Do not add AI attribution/co-author footers.
   - Use signed commits only if already required/configured in the local git environment.

5. Push:
   - Push the current branch to the remote after the commit.
   - If branch has no upstream, use `git push -u origin "$CURRENT_BRANCH"`.

6. Open PR:
   - If no PR exists, create one with `gh pr create`.
   - Do not include auto-close keywords (`Closes`, `Fixes`, `Resolves`).
   - Use a concise PR body with:
     - `## Summary`
     - `## Testing`
     - `## Related` (issue link/reference if present)

7. Wait for Gemini:
   - Wait 60 seconds for Gemini Code Assist to review.

8. Address feedback:
   - Run `/address-gemini-feedback` for unresolved comments.
   - Reply to Gemini using the REST API comment reply endpoint, not `gh pr review`.
   - Always include `@gemini-code-assist` in replies.
