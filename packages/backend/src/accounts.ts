import {hashPassword} from 'better-auth/crypto';
import type {D1Database} from './types';

type AccountDatabase = Pick<D1Database, 'prepare' | 'batch'>;

// Used by the operator CLI and tests only; it is never an HTTP endpoint, so
// registration stays closed while administrators can still be provisioned.
export async function provisionAccount(
  db: AccountDatabase,
  input: {
    action: 'create' | 'reset';
    email: string;
    name?: string;
    password: string;
  }
): Promise<void> {
  const email = input.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email))
    throw new Error('Enter a valid email address');
  if (input.password.length < 12 || input.password.length > 128)
    throw new Error('Password must contain 12–128 characters');
  const name = input.name?.trim() || 'Administrator';
  if (name.length > 100) throw new Error('Name must be at most 100 characters');
  const existing = await db
    .prepare(
      `SELECT u.id, a.id AS credentialId
       FROM auth_user u
       LEFT JOIN auth_account a
         ON a.userId = u.id AND a.providerId = 'credential'
       WHERE u.email = ?`
    )
    .bind(email)
    .all<{id: string; credentialId: string | null}>();
  const account = existing.results[0];
  if (input.action === 'create' && account)
    throw new Error('Account already exists; use reset to change its password');
  if (input.action === 'reset' && !account)
    throw new Error('Account does not exist');
  if (input.action === 'reset' && !account?.credentialId)
    throw new Error('Credential account is missing');
  const hash = await hashPassword(input.password);
  const now = new Date().toISOString();
  if (input.action === 'create') {
    const id = crypto.randomUUID();
    await db.batch([
      db
        .prepare(
          `INSERT INTO auth_user (id, name, email, emailVerified, createdAt, updatedAt)
           VALUES (?, ?, ?, 1, ?, ?)`
        )
        .bind(id, name, email, now, now),
      db
        .prepare(
          `INSERT INTO auth_account (id, accountId, providerId, userId, password, createdAt, updatedAt)
           VALUES (?, ?, 'credential', ?, ?, ?, ?)`
        )
        .bind(crypto.randomUUID(), id, id, hash, now, now),
    ]);
    return;
  }
  const userId = account?.id ?? null;
  const result = await db.batch([
    db
      .prepare(
        `UPDATE auth_account SET password = ?, updatedAt = ?
         WHERE userId = ? AND providerId = 'credential'`
      )
      .bind(hash, now, userId),
    db
      .prepare('UPDATE auth_user SET updatedAt = ? WHERE id = ?')
      .bind(now, userId),
    // A reset is the recovery path, so it signs out every existing session.
    db.prepare('DELETE FROM auth_session WHERE userId = ?').bind(userId),
  ]);
  if (result[0]?.meta.changes !== 1)
    throw new Error('Credential account is missing');
}
