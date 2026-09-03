/**
 * AI attribution signatures commonly injected into commit or PR footers. These
 * target attribution rather than ordinary prose about development tools.
 */
const AI_ATTRIBUTION_PATTERNS: ReadonlyArray<{
  readonly label: string;
  readonly pattern: RegExp;
}> = [
  {
    label:
      'Claude Code attribution link (claude.com/claude-code or claude.ai/code)',
    pattern: /claude\.(?:com\/claude-code|ai\/code)/i,
  },
  {
    label: '"Generated with Claude Code" attribution',
    pattern: /generated\s+with\s+\[?\s*claude\s+code/i,
  },
  {
    label: 'generated-with AI attribution',
    pattern: /generated\s+(?:by|with)\s+\[?\s*(?:codex|chatgpt|openai)/i,
  },
  {
    label: 'AI Co-authored-by trailer',
    pattern:
      /co-authored-by:[^\r\n]*(?:anthropic|chatgpt|claude|codex|openai)/i,
  },
  {
    label: 'AI no-reply co-author address',
    pattern: /\bnoreply@(?:anthropic|openai)\.com\b/i,
  },
];

/**
 * Reject a PR body that carries AI attribution. Throws with the matched signals
 * when attribution is present; returns silently otherwise.
 */
export function assertNoAiAttribution(body: string): void {
  const matched = AI_ATTRIBUTION_PATTERNS.filter(({pattern}) =>
    pattern.test(body)
  );
  if (matched.length === 0) {
    return;
  }

  const labels = matched.map(({label}) => `  - ${label}`).join('\n');
  throw new Error(
    `PR body contains AI attribution:\n${labels}\n\n` +
      'Remove generated-by attribution, AI co-author trailers, and attribution ' +
      'links from the PR description, ' +
      'then re-run open-pr.'
  );
}
