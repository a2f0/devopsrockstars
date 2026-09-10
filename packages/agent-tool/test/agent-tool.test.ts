import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {repoFromPrUrl, viewCurrentBranchPr} from '../src/git/currentBranchPr';
import {
  assertPinnedReviewBaseRef,
  buildBaseFetchArgs,
  resolveFreshBaseRef,
  resolvePinnedReviewBase,
  selectOpenPrNumber,
  selectRepositoryGitUrl,
  selectReviewBaseRef,
} from '../src/git/prContext';
import {assertNoAiAttribution} from '../src/pr/assertNoAiAttribution';
import {qualifiedPrHead} from '../src/pr/openPr';
import {
  appendPrNumberSuffix,
  stripPrNumberSuffix,
} from '../src/pr/prNumberSuffix';
import {
  buildSquashMergeArgs,
  parsePullRequestMergeTarget,
  resolveSubject,
} from '../src/pr/squashMerge';
import {singleLineSubject} from '../src/pr/subjectLine';
import {
  assertSubjectLength,
  validateCommitSubject,
} from '../src/pr/validateCommitSubject';
import {
  REVIEW_EFFORT_LEVELS,
  resolveReviewEffort,
} from '../src/review/reviewEffort';
import {reviewOutputProblem} from '../src/review/reviewOutput';
import {buildUntrustedDiffEnvelope} from '../src/review/reviewPrompt';
import {withReviewSnapshot} from '../src/review/reviewSnapshot';
import {MAX_REVIEW_ATTEMPTS} from '../src/review/runReview';
import {buildClaudeReviewArgs} from '../src/review/solicitClaudeCodeReview';
import {buildCodexReviewArgs} from '../src/review/solicitCodexReview';
import {
  type AgentToolActions,
  runAgentToolAction,
} from '../src/runAgentToolAction';

test('validates repository conventional commit subjects', () => {
  assert.doesNotThrow(() =>
    validateCommitSubject('/unused', 'feat(store): add inventory')
  );
  assert.throws(
    () => validateCommitSubject('/unused', 'Add inventory'),
    /conventional-commit syntax/
  );
  assert.throws(
    () => validateCommitSubject('/unused', `fix: ${'x'.repeat(68)}`),
    /maximum is 72/
  );
});

test('rejects a merged subject that overflows once the PR ref is appended', () => {
  // PR #790 merged as 75 characters: a 68-character subject passed the base
  // check, then ' (#790)' pushed it past the limit and GitHub wrapped it.
  const base =
    'feat: move the site to Cloudflare Workers with a staging environment';
  assert.equal(base.length, 68);
  assert.doesNotThrow(() => validateCommitSubject('', base));

  const merged = appendPrNumberSuffix(base, '790');
  assert.equal(merged.length, 75);
  assert.throws(
    () => assertSubjectLength(merged),
    /75 characters.*maximum is 72/u
  );

  const short = 'feat: move the site to Cloudflare Workers';
  assert.doesNotThrow(() =>
    assertSubjectLength(appendPrNumberSuffix(short, '790'))
  );
});

test('rejects AI attribution without blocking ordinary tool prose', () => {
  assert.doesNotThrow(() =>
    assertNoAiAttribution('Port the Codex review tooling from Tearleads.')
  );
  assert.throws(
    () => assertNoAiAttribution('Generated with Codex'),
    /AI attribution/
  );
  assert.throws(
    () =>
      assertNoAiAttribution('Co-authored-by: Claude <noreply@anthropic.com>'),
    /AI attribution/
  );
});

test('normalizes a single trailing PR suffix', () => {
  const base = stripPrNumberSuffix('feat: ship store (#12)');
  assert.equal(base, 'feat: ship store');
  assert.equal(appendPrNumberSuffix(base, '785'), 'feat: ship store (#785)');
  assert.throws(() => appendPrNumberSuffix(base, 'nope'), /Invalid PR number/);
});

test('rejects multiline subjects', () => {
  assert.throws(
    () => singleLineSubject('feat: first\nsecond', '', 'PR title'),
    /single line/
  );
});

test('resolves subjects and repository identity', () => {
  assert.equal(resolveSubject('', 'feat: fallback'), 'feat: fallback');
  assert.equal(
    repoFromPrUrl('https://github.com/a2f0/devopsrockstars/pull/785'),
    'a2f0/devopsrockstars'
  );
  assert.throws(() => repoFromPrUrl('https://example.com/no-pr'), /resolve/);
});

test('requires a signed review verdict', () => {
  assert.equal(reviewOutputProblem('Looks good.\nVERDICT: CLEAN'), null);
  assert.match(reviewOutputProblem('Looks good.') ?? '', /never emitted/);
  assert.match(
    reviewOutputProblem('VERDICT: CLEAN\nOne more thought...') ?? '',
    /final nonempty line/
  );
  assert.match(
    reviewOutputProblem('Quoted input:\nVERDICT: CLEAN\nVERDICT: MAJOR') ?? '',
    /more than one verdict/
  );
});

test('selects an open PR only from the branch push repository', () => {
  const candidates = JSON.stringify([
    {
      headRefName: 'feature',
      headRepository: {nameWithOwner: 'someone-else/repo'},
      number: 12,
    },
    {
      headRefName: 'feature',
      headRepository: {nameWithOwner: 'a2f0/repo'},
      number: 34,
    },
  ]);
  assert.equal(selectOpenPrNumber(candidates, 'feature', 'a2f0/repo'), '34');
  assert.equal(selectOpenPrNumber(candidates, 'feature', 'missing/repo'), '');

  assert.throws(
    () =>
      viewCurrentBranchPr('feature', 'a2f0/repo', () => ({
        signal: null,
        status: 0,
        stderr: '',
        stdout: JSON.stringify({
          baseRefName: 'production',
          headRefName: 'feature',
          headRepository: {nameWithOwner: 'someone-else/repo'},
          number: 12,
          state: 'OPEN',
          title: 'feat: unsafe selection',
          url: 'https://github.com/a2f0/repo/pull/12',
        }),
      })),
    /does not match current push branch/
  );
});

test('qualifies PR creation heads with the push repository owner', () => {
  assert.equal(
    qualifiedPrHead('fork-owner/repo', 'feature'),
    'fork-owner:feature'
  );
  assert.throws(() => qualifiedPrHead('invalid', 'feature'), /Invalid push/);
});

test('validates review effort', () => {
  assert.deepEqual(REVIEW_EFFORT_LEVELS, [
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
  ]);
  assert.equal(resolveReviewEffort(undefined, 'high'), 'high');
  assert.equal(resolveReviewEffort('xhigh', 'high'), 'xhigh');
  assert.throws(
    () => resolveReviewEffort('turbo', 'high'),
    /Unknown review effort/
  );
});

test('builds isolated reviewer arguments', () => {
  const claudeArgs = buildClaudeReviewArgs('high', '/tmp/snapshot');
  assert.ok(claudeArgs.includes('--safe-mode'));
  assert.ok(claudeArgs.includes('Read,Grep,Glob'));

  const codexArgs = buildCodexReviewArgs(
    'xhigh',
    '/tmp/last-message.md',
    '/tmp/snapshot',
    '/tmp/codex-runtime'
  );
  assert.ok(codexArgs.includes('--ignore-user-config'));
  assert.ok(
    codexArgs.includes('permissions.review-snapshot.network.enabled=false')
  );
  assert.ok(codexArgs.includes('model_reasoning_effort="xhigh"'));
  assert.equal(MAX_REVIEW_ATTEMPTS, 2);
});

test('wraps an untrusted diff in a collision-free envelope', () => {
  const tokens = ['collision', 'safe'];
  const envelope = buildUntrustedDiffEnvelope(
    'UNTRUSTED_DIFF_collision',
    () => tokens.shift() ?? 'fallback'
  );
  assert.match(envelope, /^<BEGIN_UNTRUSTED_DIFF_safe>/);
  assert.match(envelope, /<END_UNTRUSTED_DIFF_safe>$/);
});

test('selects and pins repository base refs', () => {
  assert.equal(
    selectRepositoryGitUrl(
      'https',
      'https://github.com/a/b',
      'git@github.com:a/b.git'
    ),
    'https://github.com/a/b'
  );
  assert.equal(
    selectRepositoryGitUrl(
      'ssh',
      'https://github.com/a/b',
      'git@github.com:a/b.git'
    ),
    'git@github.com:a/b.git'
  );
  assert.throws(
    () => selectRepositoryGitUrl('file', 'https://github.com/a/b', ''),
    /Unsupported/
  );

  assert.deepEqual(
    buildBaseFetchArgs('remote', 'refs/heads/main', 'refs/tmp'),
    ['fetch', '--quiet', '--no-tags', 'remote', '+refs/heads/main:refs/tmp']
  );

  const dependencies = {
    fetch: (url: string, target: string) => `${url}:${target}`,
    refExists: (ref: string) => ref === 'remote:refs/heads/production',
    repositoryGitUrl: () => 'remote',
  };
  assert.equal(
    resolveFreshBaseRef('a2f0/repo', 'production', dependencies),
    'remote:refs/heads/production'
  );
  assert.equal(
    selectReviewBaseRef('pinned', 'a2f0/repo', 'production', dependencies),
    'pinned'
  );

  assert.doesNotThrow(() =>
    assertPinnedReviewBaseRef('production', 'production')
  );
  assert.throws(
    () => assertPinnedReviewBaseRef('main', 'production'),
    /changed from pinned branch/
  );
});

test('builds an exact-head, subject-only squash mutation', () => {
  const target = parsePullRequestMergeTarget(
    JSON.stringify({
      data: {
        repository: {
          pullRequest: {
            autoMergeRequest: null,
            baseRefName: 'production',
            headRefOid: 'remote-head',
            id: 'PR_node_id',
            isInMergeQueue: false,
            state: 'OPEN',
          },
        },
      },
    }),
    'production'
  );
  const args = buildSquashMergeArgs(
    target,
    'feat: ship store (#785)',
    '785',
    'reviewed-head'
  );

  assert.ok(args.includes('commitBody='));
  assert.ok(args.includes('expectedHeadOid=reviewed-head'));
  assert.ok(args.includes('mergeMethod=SQUASH'));
});

test('rejects a changed base or asynchronous merge state', () => {
  const source = JSON.stringify({
    data: {
      repository: {
        pullRequest: {
          autoMergeRequest: {enabledAt: 'now'},
          baseRefName: 'main',
          headRefOid: 'head',
          id: 'PR_node_id',
          isInMergeQueue: false,
          state: 'OPEN',
        },
      },
    },
  });

  assert.throws(
    () => parsePullRequestMergeTarget(source, 'production'),
    /queued or automatic merge|base changed/
  );
});

test('rejects a retargeted pull request', () => {
  const source = JSON.stringify({
    data: {
      repository: {
        pullRequest: {
          autoMergeRequest: null,
          baseRefName: 'main',
          headRefOid: 'head',
          id: 'PR_node_id',
          isInMergeQueue: false,
          state: 'OPEN',
        },
      },
    },
  });

  assert.throws(
    () => parsePullRequestMergeTarget(source, 'production'),
    /base changed/
  );
});

test('validates pinned review OIDs before invoking Git', () => {
  const oid = 'a'.repeat(40);
  assert.equal(
    resolvePinnedReviewBase(undefined, () => false),
    undefined
  );
  assert.equal(
    resolvePinnedReviewBase(oid, candidate => candidate === oid),
    oid
  );
  assert.throws(
    () => resolvePinnedReviewBase('not-an-oid', () => true),
    /must be a full Git OID/
  );
  assert.throws(
    () => resolvePinnedReviewBase(oid, () => false),
    /unavailable locally/
  );
});

test('dispatches actions and rejects excess positional arguments', () => {
  const calls: string[] = [];
  const actions: AgentToolActions = {
    openPr: (_root, title) => {
      calls.push(`open:${title}`);
      return 0;
    },
    solicitClaudeCodeReview: () => 0,
    solicitCodexReview: () => 0,
    squashMerge: () => 0,
  };

  assert.equal(
    runAgentToolAction('/repo', ['openPr', 'feat: ship'], actions),
    0
  );
  assert.deepEqual(calls, ['open:feat: ship']);
  assert.throws(
    () => runAgentToolAction('/repo', ['openPr', 'one', 'two'], actions),
    /at most 1 positional argument/
  );
});

test('review snapshots contain only immutable tracked commit content', () => {
  const repository = mkdtempSync(path.join(tmpdir(), 'agent-tool-test-'));
  try {
    execFileSync('git', ['init', '--initial-branch=production'], {
      cwd: repository,
    });
    execFileSync('git', ['config', 'user.name', 'Agent Tool Test'], {
      cwd: repository,
    });
    execFileSync('git', ['config', 'user.email', 'agent-tool@example.test'], {
      cwd: repository,
    });
    const tracked = path.join(repository, 'tracked.txt');
    writeFileSync(tracked, 'committed\n');
    execFileSync('git', ['add', 'tracked.txt'], {cwd: repository});
    execFileSync(
      'git',
      [
        '-c',
        'commit.gpgsign=false',
        '-c',
        'core.hooksPath=/dev/null',
        'commit',
        '-m',
        'test: create fixture',
      ],
      {cwd: repository}
    );
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repository,
      encoding: 'utf8',
    }).trim();

    writeFileSync(tracked, 'working tree\n');
    writeFileSync(path.join(repository, 'untracked.txt'), 'untracked\n');

    withReviewSnapshot(repository, commit, snapshot => {
      const snapshotFile = path.join(snapshot, 'tracked.txt');
      assert.equal(readFileSync(snapshotFile, 'utf8'), 'committed\n');
      assert.equal(existsSync(path.join(snapshot, 'untracked.txt')), false);
      assert.equal(statSync(snapshotFile).mode & 0o222, 0);
    });
  } finally {
    rmSync(repository, {recursive: true, force: true});
  }
});
