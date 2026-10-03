---
name: enter-merge-queue
description: Drive a PR to merge in devopsrockstars by rebasing when behind, fixing CI failures, addressing Gemini review feedback, enabling auto-merge, and waiting until merged.
---

# Enter Merge Queue

Ensure a PR merges by looping through base updates, Gemini feedback handling, CI monitoring, and auto-merge until the PR is actually merged.

## Setup

Determine repository + PR metadata:

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
PR_NUMBER=$(gh pr view -R "$REPO" --json number -q .number)
BASE_BRANCH=$(gh pr view -R "$REPO" --json baseRefName -q .baseRefName)
```

Always pass `-R "$REPO"` to `gh` commands.

## Workflow

1. Verify the PR exists and collect merge status.

   ```bash
   gh pr view -R "$REPO" --json number,url,state,mergeStateStatus,mergeable,baseRefName,headRefName
   ```

2. Ensure local checkout is on the PR head branch, not the default branch.

3. Main loop until merged:
   - Check PR state:

   ```bash
   gh pr view -R "$REPO" --json state,mergeStateStatus,mergeable,autoMergeRequest
   ```

   - If `state == MERGED`, exit loop.
   - If `mergeStateStatus == BEHIND`, rebase onto base and push with lease:

   ```bash
   git fetch origin "$BASE_BRANCH"
   git rebase "origin/$BASE_BRANCH"
   git push --force-with-lease
   ```

   - If rebase conflicts cannot be safely resolved, abort and ask the user.

4. Address Gemini feedback in parallel with CI:
   - Use `/address-gemini-feedback`.
   - Reply only in the original review thread via PR comment reply endpoint.
   - Do not use `gh pr review` for thread replies.
   - Include `@gemini-code-assist` and a commit SHA in each addressed-thread reply.

5. Monitor CI runs for the current head commit:

   ```bash
   HEAD_SHA=$(git rev-parse HEAD)
   RUN_ID=$(gh run list -R "$REPO" --commit "$HEAD_SHA" --workflow main.yml --limit 1 --json databaseId -q '.[0].databaseId')
   gh run view "$RUN_ID" -R "$REPO" --json status,conclusion,jobs
   ```

   - Required PR gate in this repo is the `code-quality` job from `.github/workflows/main.yml`.
   - If `code-quality` fails, inspect failed logs and fix locally with the closest checks:
     - `bun run compile`
     - `bun run lint`
     - `bun run ci-headless`
   - Commit and push fixes, then continue the loop.

6. Enable auto-merge once checks are green, branch is not behind, and Gemini threads are addressed:

   ```bash
   gh pr merge --auto --merge -R "$REPO"
   ```

7. Keep polling until GitHub reports merged. If it becomes `BEHIND` again, rebase/push and continue.

8. After merge, sync local default branch:

   ```bash
   git checkout "$BASE_BRANCH"
   git pull --ff-only origin "$BASE_BRANCH"
   ```

## Notes

- Do not create or modify issues unless explicitly requested.
- Do not use top-level PR comments to answer review feedback.
- Keep PR description current (`Summary`, `Testing`, `Related`) as changes evolve.
