import {afterEach, beforeEach, expect, test} from 'bun:test';
import type {
  AdminAlertsResponse,
  AdminInventoryResponse,
  AdminOrdersResponse,
  StorefrontResponse,
} from '@devopsrockstars/shared-types';
import {getMigrations} from 'better-auth/db/migration';
import {provisionAccount} from './accounts';
import {validateVariantUpdate} from './admin';
import {createAuth} from './auth';
import {cleanupExpiredAuth} from './cleanup';
import worker from './index';
import {testDatabase} from './testDatabase';
import type {Env} from './types';

const API = 'https://store.devopsrockstars.com';
const SITE = 'https://devopsrockstars.com';
const ACCOUNT = {
  email: 'admin@example.test',
  name: 'Test administrator',
  password: 'local-test-password-0001',
};

let storage: Awaited<ReturnType<typeof testDatabase>>;
let env: Env;

beforeEach(async () => {
  storage = await testDatabase();
  env = {
    DB: storage.db,
    BETTER_AUTH_SECRET: 'isolated-unit-test-secret-never-for-production-01',
    STOREFRONT_ORIGINS: `${SITE},https://www.devopsrockstars.com`,
  };
});
afterEach(() => storage.sqlite.close());

function call(
  path: string,
  {
    method = 'GET',
    body,
    cookie = '',
    origin = SITE,
    contentType = 'application/json',
    ip = '203.0.113.5',
  }: {
    method?: string;
    body?: unknown;
    cookie?: string;
    origin?: string | null;
    contentType?: string;
    ip?: string;
  } = {}
) {
  const headers = new Headers({
    Cookie: cookie,
    'Content-Type': contentType,
    'CF-Connecting-IP': ip,
  });
  if (origin !== null) headers.set('Origin', origin);
  return worker.fetch(
    new Request(`${API}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    }),
    env,
    {waitUntil: () => {}}
  );
}

const login = (password = ACCOUNT.password, ip?: string) =>
  call('/api/auth/sign-in/email', {
    method: 'POST',
    body: {email: ACCOUNT.email, password},
    ...(ip ? {ip} : {}),
  });

function cookieOf(response: Response) {
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('Missing session cookie');
  return cookie;
}

async function signedIn() {
  await provisionAccount(env.DB, {action: 'create', ...ACCOUNT});
  const response = await login();
  expect(response.status).toBe(200);
  return cookieOf(response);
}

function count(table: string) {
  return (
    storage.sqlite.query(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
      n: number;
    }
  ).n;
}

function insertOrder(
  id: string,
  status: string,
  createdAt: string,
  variantId = 'hat-5950-7',
  quantity = 1
) {
  storage.sqlite
    .query(
      `INSERT INTO orders (
         id, access_token_hash, status, currency, subtotal_amount,
         shipping_amount, total_amount, email, shipping_name,
         shipping_address_line1, shipping_city, shipping_state,
         shipping_postal_code, shipping_country, reservation_expires_at,
         paid_at, created_at, updated_at
       ) VALUES (?, 'hash', ?, 'usd', 2000, 0, 2000, 'buyer@example.test',
         'Test Buyer', '1 Test Way', 'New York', 'NY', '10001', 'US', ?, ?, ?, ?)`
    )
    .run(
      id,
      status,
      createdAt,
      status === 'paid' ? createdAt : null,
      createdAt,
      createdAt
    );
  storage.sqlite
    .query(
      `INSERT INTO order_items (
         order_id, variant_id, product_id, sku, product_name, variant_label,
         unit_amount, quantity, line_total
       ) VALUES (?, ?, 'hat-5950', 'DOR-5950-7', 'DevOpsRockstars 59FIFTY',
         '7', 2000, ?, ?)`
    )
    .run(id, variantId, quantity, 2000 * quantity);
}

test('the migration matches the installed Better Auth schema', async () => {
  const plan = await getMigrations(createAuth(env, API).options);
  expect(plan.toBeCreated).toEqual([]);
  expect(plan.toBeAdded).toEqual([]);
  expect(plan.toBeAddedIndexes).toEqual([]);
  expect(plan.schemaProblems).toEqual([]);
  expect(plan.unsafeChanges).toEqual([]);
});

test('registration and password reset are closed in routing and the library', async () => {
  for (const path of [
    '/api/auth/sign-up/email',
    '/api/auth/request-password-reset',
    '/api/auth/reset-password',
    '/api/auth/update-user',
  ])
    expect((await call(path, {method: 'POST', body: ACCOUNT})).status).toBe(
      404
    );
  const direct = await createAuth(env, API).handler(
    new Request(`${API}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: {Origin: SITE, 'Content-Type': 'application/json'},
      body: JSON.stringify(ACCOUNT),
    })
  );
  expect(direct.status).toBe(400);
  expect(count('auth_user')).toBe(0);
});

test('admin data requires a session and never discloses it to anonymous callers', async () => {
  for (const path of [
    '/api/admin/inventory',
    '/api/admin/orders',
    '/api/admin/alerts',
  ]) {
    const response = await call(path);
    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.text()).not.toContain('59FIFTY');
  }
  expect(
    (
      await call('/api/admin/variants/hat-5950-7', {
        method: 'POST',
        body: {active: false},
      })
    ).status
  ).toBe(401);
  expect((await call('/api/admin/missing')).status).toBe(404);
  expect(
    (await call('/api/admin/inventory', {method: 'POST', body: {}})).status
  ).toBe(405);
});

test('mutations require a trusted origin and a JSON body', async () => {
  const cookie = await signedIn();
  for (const origin of [
    'https://evil.example',
    'https://shop.devopsrockstars.com',
    null,
  ])
    expect(
      (
        await call('/api/admin/variants/hat-5950-7', {
          method: 'POST',
          body: {active: false},
          cookie,
          origin,
        })
      ).status
    ).toBe(403);
  expect(
    (
      await call('/api/admin/variants/hat-5950-7', {
        method: 'POST',
        body: {active: false},
        cookie,
        contentType: 'text/plain',
      })
    ).status
  ).toBe(415);
  expect(
    (
      await call('/api/auth/sign-in/email', {
        method: 'POST',
        body: {email: ACCOUNT.email, password: ACCOUNT.password},
        origin: 'https://evil.example',
      })
    ).status
  ).toBe(403);
});

test('sign-in sets a host-only secure cookie that the site may send cross-origin', async () => {
  await provisionAccount(env.DB, {action: 'create', ...ACCOUNT});
  const response = await login();
  expect(response.status).toBe(200);
  const setCookie = response.headers.get('set-cookie') ?? '';
  expect(setCookie).toStartWith('__Secure-dor-admin.session_token=');
  expect(setCookie).toContain('HttpOnly');
  expect(setCookie).toContain('Secure');
  expect(setCookie).toContain('SameSite=Lax');
  expect(setCookie).not.toContain('Domain=');
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe(SITE);
  expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');

  const session = await call('/api/auth/get-session', {
    cookie: cookieOf(response),
  });
  expect(((await session.json()) as {user: {email: string}}).user.email).toBe(
    ACCOUNT.email
  );

  // Public store routes never allow credentials.
  const storefront = await call('/api/storefront');
  expect(storefront.headers.get('Access-Control-Allow-Origin')).toBe(SITE);
  expect(storefront.headers.get('Access-Control-Allow-Credentials')).toBeNull();
});

test('inventory edits are atomic against concurrent checkout reservations', async () => {
  const cookie = await signedIn();
  insertOrder(
    '10000000-0000-4000-8000-000000000001',
    'awaiting_payment',
    '2026-10-01T10:00:00.000Z'
  );
  insertOrder(
    '10000000-0000-4000-8000-000000000002',
    'paid',
    '2026-10-01T11:00:00.000Z',
    'hat-5950-7',
    2
  );
  const inventory = (await (
    await call('/api/admin/inventory', {cookie})
  ).json()) as AdminInventoryResponse;
  const variant = inventory.products[0]?.variants.find(
    entry => entry.id === 'hat-5950-7'
  );
  expect(variant).toMatchObject({
    inventoryQuantity: 0,
    reservedQuantity: 1,
    soldQuantity: 2,
    unitAmount: 2000,
    active: true,
  });

  const updated = await call('/api/admin/variants/hat-5950-7', {
    method: 'POST',
    cookie,
    body: {
      expectedInventoryQuantity: 0,
      inventoryQuantity: 12,
      unitAmount: 2500,
    },
  });
  expect(updated.status).toBe(200);
  const after = (await updated.json()) as AdminInventoryResponse;
  expect(
    after.products[0]?.variants.find(entry => entry.id === 'hat-5950-7')
  ).toMatchObject({inventoryQuantity: 12, unitAmount: 2500});

  // A checkout reserved one meanwhile, so the stale edit is refused.
  storage.sqlite.exec(
    "UPDATE product_variants SET inventory_quantity = 11 WHERE id = 'hat-5950-7'"
  );
  const stale = await call('/api/admin/variants/hat-5950-7', {
    method: 'POST',
    cookie,
    body: {expectedInventoryQuantity: 12, inventoryQuantity: 20},
  });
  expect(stale.status).toBe(409);
  expect(
    storage.sqlite
      .query(
        "SELECT inventory_quantity AS n FROM product_variants WHERE id = 'hat-5950-7'"
      )
      .get()
  ).toEqual({n: 11});

  expect(
    (
      await call('/api/admin/variants/hat-5950-missing', {
        method: 'POST',
        cookie,
        body: {active: false},
      })
    ).status
  ).toBe(404);
  for (const body of [
    {},
    {inventoryQuantity: 5},
    {inventoryQuantity: -1, expectedInventoryQuantity: 11},
    {inventoryQuantity: 1.5, expectedInventoryQuantity: 11},
    {unitAmount: 49},
    {active: 'no'},
    {active: true, name: 'renamed'},
  ])
    expect(
      (
        await call('/api/admin/variants/hat-5950-7', {
          method: 'POST',
          cookie,
          body,
        })
      ).status
    ).toBe(400);
});

test('deactivating a product or variant removes it from the storefront', async () => {
  const cookie = await signedIn();
  expect(
    (
      await call('/api/admin/variants/hat-5950-7', {
        method: 'POST',
        cookie,
        body: {active: false},
      })
    ).status
  ).toBe(200);
  let storefront = (await (
    await call('/api/storefront')
  ).json()) as StorefrontResponse;
  expect(
    storefront.products[0]?.variants.some(entry => entry.id === 'hat-5950-7')
  ).toBe(false);

  const hidden = await call('/api/admin/products/hat-5950', {
    method: 'POST',
    cookie,
    body: {active: false},
  });
  expect(hidden.status).toBe(200);
  expect(
    ((await hidden.json()) as AdminInventoryResponse).products[0]?.active
  ).toBe(false);
  storefront = (await (
    await call('/api/storefront')
  ).json()) as StorefrontResponse;
  expect(storefront.products).toEqual([]);
  expect(
    (
      await call('/api/admin/products/hat-5950', {
        method: 'POST',
        cookie,
        body: {active: 1},
      })
    ).status
  ).toBe(400);
});

test('orders page newest first with filters, counts, and line items', async () => {
  const cookie = await signedIn();
  for (let index = 0; index < 27; index++)
    insertOrder(
      `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      index % 3 === 0 ? 'paid' : 'canceled',
      new Date(Date.UTC(2026, 9, 1, 0, index)).toISOString()
    );
  const first = (await (
    await call('/api/admin/orders', {cookie})
  ).json()) as AdminOrdersResponse;
  expect(first.orders).toHaveLength(25);
  expect(first.orders[0]?.id).toBe('20000000-0000-4000-8000-000000000026');
  expect(first.orders[0]?.items).toEqual([
    {
      sku: 'DOR-5950-7',
      productName: 'DevOpsRockstars 59FIFTY',
      variantLabel: '7',
      unitAmount: 2000,
      quantity: 1,
      lineTotal: 2000,
    },
  ]);
  expect(first.orders[0]?.shipping.city).toBe('New York');
  expect(first.counts).toEqual({
    creating_payment: 0,
    awaiting_payment: 0,
    paid: 9,
    canceled: 18,
  });
  expect(first.nextCursor).not.toBeNull();
  const second = (await (
    await call(
      `/api/admin/orders?cursor=${encodeURIComponent(first.nextCursor ?? '')}`,
      {cookie}
    )
  ).json()) as AdminOrdersResponse;
  expect(second.orders.map(order => order.id)).toEqual([
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000000',
  ]);
  expect(second.nextCursor).toBeNull();

  const paid = (await (
    await call('/api/admin/orders?status=paid', {cookie})
  ).json()) as AdminOrdersResponse;
  expect(paid.orders).toHaveLength(9);
  expect(paid.orders.every(order => order.status === 'paid')).toBe(true);
  for (const query of ['?status=shipped', '?cursor=nonsense'])
    expect((await call(`/api/admin/orders${query}`, {cookie})).status).toBe(
      400
    );
});

test('open Stripe alerts can be reviewed and resolved', async () => {
  const cookie = await signedIn();
  storage.sqlite.exec(`
    INSERT INTO stripe_events (id, type, processed_at)
    VALUES ('cleanup:pi_123', 'cleanup.payment_intent.succeeded', '2026-10-01T00:00:00.000Z');
    INSERT INTO stripe_event_alerts (
      event_id, reason, action, order_id, payment_intent_id, amount_received,
      currency, created_at
    ) VALUES (
      'cleanup:pi_123', 'payment_mismatch', 'refund',
      '10000000-0000-4000-8000-000000000001', 'pi_123', 2000, 'usd',
      '2026-10-01T00:00:00.000Z'
    );
  `);
  const open = (await (
    await call('/api/admin/alerts', {cookie})
  ).json()) as AdminAlertsResponse;
  expect(open.alerts).toHaveLength(1);
  expect(open.alerts[0]).toMatchObject({
    eventId: 'cleanup:pi_123',
    action: 'refund',
    status: 'open',
  });
  const resolve = (id: string) =>
    call(`/api/admin/alerts/${encodeURIComponent(id)}/resolve`, {
      method: 'POST',
      cookie,
      body: {},
    });
  const resolved = await resolve('cleanup:pi_123');
  expect(resolved.status).toBe(200);
  expect(((await resolved.json()) as AdminAlertsResponse).alerts).toEqual([]);
  expect((await resolve('cleanup:pi_123')).status).toBe(404);
  const history = (await (
    await call('/api/admin/alerts?status=resolved', {cookie})
  ).json()) as AdminAlertsResponse;
  expect(history.alerts[0]?.resolvedAt).not.toBeNull();
});

test('password changes and sign-out revoke sessions; resets revoke every session', async () => {
  const first = await signedIn();
  const second = cookieOf(await login());
  const newPassword = 'changed-password-0002';
  const changed = await call('/api/auth/change-password', {
    method: 'POST',
    cookie: first,
    body: {
      currentPassword: ACCOUNT.password,
      newPassword,
      revokeOtherSessions: false,
    },
  });
  expect(changed.status).toBe(200);
  const current = cookieOf(changed);
  expect((await call('/api/admin/inventory', {cookie: second})).status).toBe(
    401
  );
  expect((await call('/api/admin/inventory', {cookie: current})).status).toBe(
    200
  );
  expect((await login(ACCOUNT.password)).status).toBe(401);
  expect(
    (
      await call('/api/auth/sign-out', {
        method: 'POST',
        cookie: current,
        body: {},
      })
    ).status
  ).toBe(200);
  expect((await call('/api/admin/inventory', {cookie: current})).status).toBe(
    401
  );

  const recovered = cookieOf(await login(newPassword));
  await provisionAccount(env.DB, {
    action: 'reset',
    email: ACCOUNT.email,
    password: 'reset-password-0003',
  });
  expect((await call('/api/admin/inventory', {cookie: recovered})).status).toBe(
    401
  );
  expect((await login('reset-password-0003')).status).toBe(200);
});

test('sign-in attempts are rate limited per address', async () => {
  await provisionAccount(env.DB, {action: 'create', ...ACCOUNT});
  for (let attempt = 0; attempt < 5; attempt++)
    expect((await login('wrong-password-0000')).status).toBe(401);
  expect((await login()).status).toBe(429);
  expect((await login(ACCOUNT.password, '203.0.113.9')).status).toBe(200);
});

test('a missing signing secret fails closed', async () => {
  await provisionAccount(env.DB, {action: 'create', ...ACCOUNT});
  env = {...env, BETTER_AUTH_SECRET: ''};
  expect((await login()).status).toBe(503);
  expect((await call('/api/auth/get-session')).status).toBe(503);
  expect((await call('/api/admin/inventory')).status).toBe(503);
  expect((await call('/api/storefront')).status).toBe(200);
});

test('expired administrator records are swept', async () => {
  const cookie = await signedIn();
  const now = Date.now();
  storage.sqlite
    .query('UPDATE auth_session SET expiresAt = ?')
    .run(new Date(now - 1000).toISOString());
  storage.sqlite
    .query(
      "INSERT INTO auth_rate_limit (id, key, count, lastRequest) VALUES ('old', 'old-key', 1, ?)"
    )
    .run(now - 2 * 86_400_000);
  await cleanupExpiredAuth(env, now);
  expect(count('auth_session')).toBe(0);
  expect(
    storage.sqlite
      .query("SELECT id FROM auth_rate_limit WHERE id = 'old'")
      .all()
  ).toEqual([]);
  expect(count('auth_user')).toBe(1);
  expect((await call('/api/admin/inventory', {cookie})).status).toBe(401);
});

test('provisioning validates input and refuses duplicates', async () => {
  await expect(
    provisionAccount(env.DB, {action: 'create', ...ACCOUNT, password: 'short'})
  ).rejects.toThrow('Password must contain 12–128 characters');
  await expect(
    provisionAccount(env.DB, {action: 'reset', ...ACCOUNT})
  ).rejects.toThrow('Account does not exist');
  await provisionAccount(env.DB, {
    action: 'create',
    ...ACCOUNT,
    email: ' Admin@Example.TEST ',
  });
  expect(storage.sqlite.query('SELECT email FROM auth_user').get()).toEqual({
    email: ACCOUNT.email,
  });
  await expect(
    provisionAccount(env.DB, {action: 'create', ...ACCOUNT})
  ).rejects.toThrow('Account already exists');
});

test('variant updates accept only complete, bounded changes', () => {
  expect(
    validateVariantUpdate({inventoryQuantity: 3, expectedInventoryQuantity: 2})
  ).toEqual({inventoryQuantity: 3, expectedInventoryQuantity: 2});
  expect(validateVariantUpdate({expectedInventoryQuantity: 2})).toBeNull();
  expect(
    validateVariantUpdate({
      inventoryQuantity: 100_001,
      expectedInventoryQuantity: 0,
    })
  ).toBeNull();
  expect(validateVariantUpdate({unitAmount: 2500, active: false})).toEqual({
    unitAmount: 2500,
    active: false,
  });
});
