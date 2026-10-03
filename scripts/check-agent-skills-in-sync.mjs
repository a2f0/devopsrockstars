#!/usr/bin/env bun
/**
 * Claude Code and Codex each discover skills from their own directory, so the
 * repository keeps one copy per agent. The copies are deliberately written
 * agent-neutral and must stay byte-identical: the upstream repository this was
 * ported from let its two copies drift, and one agent silently lost a whole
 * section of the workflow.
 */
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

const CLAUDE_SKILLS = '.claude/skills';
const CODEX_SKILLS = '.codex/skills';

function skillNames(directory) {
  try {
    return readdirSync(directory, {withFileTypes: true})
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  } catch {
    return [];
  }
}

const shared = skillNames(CLAUDE_SKILLS).filter(name =>
  skillNames(CODEX_SKILLS).includes(name)
);
const problems = [];

for (const name of shared) {
  const claude = join(CLAUDE_SKILLS, name, 'SKILL.md');
  const codex = join(CODEX_SKILLS, name, 'SKILL.md');
  if (readFileSync(claude, 'utf8') !== readFileSync(codex, 'utf8')) {
    problems.push(`  ${name}: ${claude} and ${codex} have diverged`);
  }
}

if (problems.length > 0) {
  console.error('Agent skills shared by both agents must be identical:');
  console.error(problems.join('\n'));
  console.error('\nCopy the intended version over the other, keeping the text');
  console.error('agent-neutral so a single wording serves both.');
  process.exit(1);
}

console.log(`Agent skills in sync (${shared.length} shared).`);
