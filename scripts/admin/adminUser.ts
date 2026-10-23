#!/usr/bin/env bun
import {StringDecoder} from 'node:string_decoder';
import {provisionAccount} from '../../packages/backend/src/accounts';
import {type AccountTarget, withAccountDatabase} from './accountDatabase';

const usage =
  'Usage: bun run admin:user <create|reset> --email <email> [--name <name>] (--local | --env <staging|prod>) [--password-stdin]';

export function parseAccountArgs(input: readonly string[]) {
  const args = [...input];
  const action = args.shift();
  if (action !== 'create' && action !== 'reset') throw new Error(usage);
  const values = new Map<string, string>();
  const flags = new Set<string>();
  while (args.length) {
    const key = args.shift() ?? '';
    if (['--local', '--password-stdin'].includes(key)) {
      if (flags.has(key)) throw new Error('Duplicate option');
      flags.add(key);
    } else if (['--email', '--name', '--env'].includes(key)) {
      const value = args.shift();
      if (!value || values.has(key))
        throw new Error('Missing or duplicate option');
      values.set(key, value);
    } else
      throw new Error(
        'Unknown option; passwords must use the hidden prompt or --password-stdin'
      );
  }
  const environment = values.get('--env');
  if (flags.has('--local') === (environment !== undefined))
    throw new Error('Choose exactly one of --local or --env');
  if (environment !== undefined && !['staging', 'prod'].includes(environment))
    throw new Error('--env must be staging or prod');
  const email = values.get('--email');
  if (!email) throw new Error('--email is required');
  return {
    action: action as 'create' | 'reset',
    email,
    name: values.get('--name') ?? 'Administrator',
    target: (environment ?? 'local') as AccountTarget,
    stdin: flags.has('--password-stdin'),
  };
}

export async function readPasswordStdin(
  input: AsyncIterable<Uint8Array | string> = process.stdin
): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of input) {
    const bytes = Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > 1024) throw new Error('Password input is too large');
    chunks.push(bytes);
  }
  const value = Buffer.concat(chunks)
    .toString('utf8')
    .replace(/\r?\n$/u, '');
  if (/[\r\n]/u.test(value)) throw new Error('Supply one password line');
  return value;
}

async function hiddenPrompt(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error('Use an interactive terminal or --password-stdin');
  process.stdout.write(label);
  const previous = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const decoder = new StringDecoder('utf8');
    const finish = (error?: Error) => {
      process.stdin.off('data', read);
      process.stdin.setRawMode(previous);
      process.stdin.pause();
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const read = (chunk: Buffer) => {
      for (const char of decoder.write(chunk)) {
        if (char === '\u0003') {
          finish(new Error('Cancelled'));
          return;
        }
        if (char === '\r' || char === '\n') {
          finish();
          return;
        }
        if (char === '\u007f' || char === '\b')
          value = Array.from(value).slice(0, -1).join('');
        else if (char >= ' ') value += char;
        if (value.length > 128) {
          finish(new Error('Password must contain 12–128 characters'));
          return;
        }
      }
    };
    process.stdin.on('data', read);
  });
}

// Adapter and Wrangler errors can contain SQL; only these messages are printed.
const safeMessages = new Set([
  usage,
  'Duplicate option',
  'Missing or duplicate option',
  'Unknown option; passwords must use the hidden prompt or --password-stdin',
  'Choose exactly one of --local or --env',
  '--env must be staging or prod',
  '--email is required',
  'Password input is too large',
  'Supply one password line',
  'Use an interactive terminal or --password-stdin',
  'Cancelled',
  'Password must contain 12–128 characters',
  'Passwords do not match',
  'Enter a valid email address',
  'Name must be at most 100 characters',
  'Account already exists; use reset to change its password',
  'Account does not exist',
  'Credential account is missing',
]);

if (import.meta.main) {
  try {
    const options = parseAccountArgs(process.argv.slice(2));
    const password = options.stdin
      ? await readPasswordStdin()
      : await hiddenPrompt('Password (hidden): ');
    if (
      !options.stdin &&
      password !== (await hiddenPrompt('Confirm password (hidden): '))
    )
      throw new Error('Passwords do not match');
    await withAccountDatabase(options.target, db =>
      provisionAccount(db, {
        action: options.action,
        email: options.email,
        name: options.name,
        password,
      })
    );
    console.log(
      options.action === 'create'
        ? `Administrator account created (${options.target}).`
        : `Password reset; all existing sessions revoked (${options.target}).`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    console.error(
      safeMessages.has(message)
        ? message
        : 'Account operation failed. Check Wrangler login, the selected database, and applied migrations.'
    );
    process.exitCode = 1;
  }
}
