import {expect, test} from 'bun:test';
import type {
  AdminInventoryResponse,
  StorefrontResponse,
} from '@devopsrockstars/shared-types';
import {hashPassword} from 'better-auth/crypto';
import {localD1, startLocalStack} from './localWorker';

const ACCOUNT = {
  email: 'admin@example.test',
  password: 'local-test-password-0001',
};

// The real auth boundary: workerd, the migrated D1 schema, Better Auth, and the
// site's /api proxy carrying the session cookie the way a browser would.
test('a provisioned administrator signs in, edits stock, and signs out through the site proxy', async () => {
  const {site, origin, stop} = await startLocalStack({
    vars: {
      BETTER_AUTH_SECRET:
        'isolated-integration-test-secret-never-for-production',
    },
    prepare: async persistence => {
      localD1(persistence, ['migrations', 'apply']);
      const hash = await hashPassword(ACCOUNT.password);
      const now = new Date().toISOString();
      localD1(
        persistence,
        ['execute'],
        [
          '--command',
          `INSERT INTO auth_user (id, name, email, emailVerified, createdAt, updatedAt)
           VALUES ('admin', 'Administrator', '${ACCOUNT.email}', 1, '${now}', '${now}');
           INSERT INTO auth_account (id, accountId, providerId, userId, password, createdAt, updatedAt)
           VALUES ('credential', 'admin', 'credential', 'admin', '${hash}', '${now}', '${now}');`,
        ]
      );
    },
  });
  const call = (
    pathname: string,
    {body, cookie = ''}: {body?: unknown; cookie?: string} = {}
  ) =>
    fetch(new URL(pathname, site), {
      method: body === undefined ? 'GET' : 'POST',
      signal: AbortSignal.timeout(10000),
      headers: {
        Origin: origin,
        Cookie: cookie,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    });
  try {
    expect((await call('/api/admin/inventory')).status).toBe(401);
    expect(
      (await call('/api/auth/sign-up/email', {body: {...ACCOUNT, name: 'x'}}))
        .status
    ).toBe(404);
    expect(
      (
        await call('/api/auth/sign-in/email', {
          body: {...ACCOUNT, password: 'wrong-password-0000'},
        })
      ).status
    ).toBe(401);

    const signIn = await call('/api/auth/sign-in/email', {body: ACCOUNT});
    expect(signIn.status).toBe(200);
    const setCookie = signIn.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('dor-admin.session_token=');
    expect(setCookie).toContain('HttpOnly');
    const cookie = setCookie.split(';')[0] ?? '';

    const session = (await (
      await call('/api/auth/get-session', {cookie})
    ).json()) as {user: {email: string}};
    expect(session.user.email).toBe(ACCOUNT.email);
    const inventory = (await (
      await call('/api/admin/inventory', {cookie})
    ).json()) as AdminInventoryResponse;
    expect(
      inventory.products[0]?.variants.find(entry => entry.id === 'hat-5950-7')
        ?.inventoryQuantity
    ).toBe(0);

    const saved = await call('/api/admin/variants/hat-5950-7', {
      cookie,
      body: {expectedInventoryQuantity: 0, inventoryQuantity: 3},
    });
    expect(saved.status).toBe(200);
    const storefront = (await (
      await call('/api/storefront')
    ).json()) as StorefrontResponse;
    expect(
      storefront.products[0]?.variants.find(entry => entry.id === 'hat-5950-7')
        ?.availableQuantity
    ).toBe(3);

    expect((await call('/api/auth/sign-out', {cookie, body: {}})).status).toBe(
      200
    );
    expect((await call('/api/admin/inventory', {cookie})).status).toBe(401);
  } finally {
    await stop();
  }
}, 90000);
