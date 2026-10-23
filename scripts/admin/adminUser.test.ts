import {expect, test} from 'bun:test';
import {parseAccountArgs, readPasswordStdin} from './adminUser';

test('account commands name one target and never accept a password argument', () => {
  expect(
    parseAccountArgs(['create', '--email', 'a@example.test', '--env', 'prod'])
  ).toEqual({
    action: 'create',
    email: 'a@example.test',
    name: 'Administrator',
    target: 'prod',
    stdin: false,
  });
  expect(
    parseAccountArgs([
      'reset',
      '--local',
      '--email',
      'a@example.test',
      '--password-stdin',
    ])
  ).toMatchObject({action: 'reset', target: 'local', stdin: true});
  for (const args of [
    ['delete', '--local', '--email', 'a@example.test'],
    ['create', '--email', 'a@example.test'],
    ['create', '--local', '--env', 'prod', '--email', 'a@example.test'],
    ['create', '--env', 'production', '--email', 'a@example.test'],
    ['create', '--local'],
    ['create', '--local', '--email', 'a@example.test', '--password', 'secret'],
    ['create', '--local', '--local', '--email', 'a@example.test'],
  ])
    expect(() => parseAccountArgs(args)).toThrow();
});

test('stdin passwords are one bounded line', async () => {
  async function* lines(...chunks: string[]) {
    yield* chunks;
  }
  expect(await readPasswordStdin(lines('local-test-pass', 'word\n'))).toBe(
    'local-test-password'
  );
  await expect(readPasswordStdin(lines('one\ntwo\n'))).rejects.toThrow(
    'Supply one password line'
  );
  await expect(readPasswordStdin(lines('x'.repeat(1025)))).rejects.toThrow(
    'Password input is too large'
  );
});
