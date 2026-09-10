const MAX_SUBJECT_LENGTH = 72;
const CONVENTIONAL_SUBJECT =
  /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([a-z0-9][a-z0-9._/-]*\))?!?: \S.*$/;

/**
 * Validate the conventional-commit format used by this repository. Keeping the
 * check local avoids adding a commitlint dependency solely for the agent tool.
 */
export function validateCommitSubject(_rootDir: string, subject: string): void {
  assertSubjectLength(subject);
  if (!CONVENTIONAL_SUBJECT.test(subject)) {
    throw new Error(
      'Commit subject must use conventional-commit syntax, for example ' +
        "'feat(store): add inventory checks'."
    );
  }
}

/**
 * Enforce the subject-line budget. Squash subjects are validated before their
 * ` (#<pr>)` reference is appended, so the base can pass at the limit and still
 * produce a longer merged subject. Anything past 72 characters wraps onto a
 * second line in GitHub's commit views, where the overflow reads as a stray
 * commit body — so the *merged* subject is what has to fit.
 */
export function assertSubjectLength(subject: string): void {
  if (subject.length > MAX_SUBJECT_LENGTH) {
    throw new Error(
      `Commit subject is ${subject.length} characters; the maximum is ${MAX_SUBJECT_LENGTH}. ` +
        `Shorten it by ${subject.length - MAX_SUBJECT_LENGTH}: '${subject}'`
    );
  }
}
