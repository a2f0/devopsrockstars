const MAX_SUBJECT_LENGTH = 72;
const CONVENTIONAL_SUBJECT =
  /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([a-z0-9][a-z0-9._/-]*\))?!?: \S.*$/;

/**
 * Validate the conventional-commit format used by this repository. Keeping the
 * check local avoids adding a commitlint dependency solely for the agent tool.
 */
export function validateCommitSubject(_rootDir: string, subject: string): void {
  if (subject.length > MAX_SUBJECT_LENGTH) {
    throw new Error(
      `Commit subject is ${subject.length} characters; the maximum is ${MAX_SUBJECT_LENGTH}.`
    );
  }
  if (!CONVENTIONAL_SUBJECT.test(subject)) {
    throw new Error(
      'Commit subject must use conventional-commit syntax, for example ' +
        "'feat(store): add inventory checks'."
    );
  }
}
