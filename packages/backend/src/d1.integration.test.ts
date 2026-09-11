import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {reservationStatements} from './checkout';
import type {D1Database, D1PreparedStatement, D1Result, Env} from './types';

const repository = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

function wrangler(arguments_: readonly string[]) {
  return spawnSync('pnpm', ['--silent', 'exec', 'wrangler', ...arguments_], {
    cwd: repository,
    encoding: 'utf8',
    env: {...process.env, CI: 'true'},
  });
}

// The reservation SQL comes from the worker itself rather than a copy here:
// a copy cannot catch the statement drifting out of step with the schema, which
// is how the orders insert once ended up binding 19 values for 20 columns.
function literal(value: unknown) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/gu, "''")}'`;
}

class RecordingStatement implements D1PreparedStatement {
  values: readonly unknown[] = [];

  constructor(readonly query: string) {}

  bind(...values: readonly unknown[]) {
    this.values = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    return null;
  }

  async all<T>(): Promise<D1Result<T>> {
    return {meta: {changes: 0}, results: [], success: true};
  }

  async run<T>(): Promise<D1Result<T>> {
    return {meta: {changes: 0}, results: [], success: true};
  }
}

class RecordingDatabase implements D1Database {
  readonly recorded: RecordingStatement[] = [];

  prepare(query: string) {
    const statement = new RecordingStatement(query);
    this.recorded.push(statement);
    return statement;
  }

  async batch<T>(): Promise<readonly D1Result<T>[]> {
    return [];
  }
}

const VARIANT = {
  active: 1,
  currency: 'usd',
  inventory_quantity: 2,
  label: '7 1/4',
  product_active: 1,
  product_id: 'hat-5950',
  product_name: 'DevOps Rockstars 59FIFTY',
  sku: 'DOR-5950-7-1-4',
  unit_amount: 2000,
  variant_id: 'hat-5950-7-1-4',
};

function reservationSql(id: string, clientHash: string, networkHash: string) {
  const database = new RecordingDatabase();
  reservationStatements({
    accessTokenHash: 'token-hash',
    clientHash,
    networkHash,
    currency: 'usd',
    expiresAt: '2026-09-03T18:10:00.000Z',
    lines: [
      {
        quantity: 1,
        variantId: 'hat-5950-7-1-4',
        variant: VARIANT,
        lineTotal: 2000,
      },
    ],
    now: '2026-09-03T18:00:00.000Z',
    orderId: id,
    request: {
      items: [{variantId: 'hat-5950-7-1-4', quantity: 1}],
      shipping: {
        name: 'Test Buyer',
        email: 'test@example.com',
        addressLine1: '1 Test Way',
        addressLine2: '',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      },
    },
    totalAmount: 2000,
    env: {DB: database} as Env,
  });
  return database.recorded.map(statement => {
    let index = 0;
    return statement.query.replace(/\?/gu, () =>
      literal(statement.values[index++])
    );
  });
}

function orderSql(id: string, clientHash: string, networkHash: string) {
  const [orders] = reservationSql(id, clientHash, networkHash);
  assert.ok(orders);
  return orders;
}

test('D1 migrations enforce reservation, restock, and cap invariants', () => {
  const persistence = mkdtempSync(path.join(tmpdir(), 'store-d1-test-'));
  // Local migrations run against the staging environment's binding, matching
  // the db:migrate:local script.
  const localArguments = [
    'devopsrockstars-store-staging',
    '--env',
    'staging',
    '--local',
    '--persist-to',
    persistence,
  ];
  const execute = (sql: string) =>
    wrangler(['d1', 'execute', ...localArguments, '--command', sql, '--json']);

  try {
    const migrated = wrangler(['d1', 'migrations', 'apply', ...localArguments]);
    assert.equal(migrated.status, 0, migrated.stderr || migrated.stdout);

    // The whole reservation batch, exactly as the worker builds it.
    const reservation = reservationSql(
      '10000000-0000-4000-8000-000000000001',
      'client-1',
      'network-1'
    ).join(';\n      ');
    const reserved = execute(`
      UPDATE product_variants
      SET inventory_quantity = 2
      WHERE id = 'hat-5950-7-1-4';
      ${reservation};
    `);
    assert.equal(reserved.status, 0, reserved.stderr || reserved.stdout);

    const belowZero = execute(`
      UPDATE product_variants
      SET inventory_quantity = inventory_quantity - 2
      WHERE id = 'hat-5950-7-1-4'
    `);
    assert.notEqual(belowZero.status, 0);
    assert.match(
      `${belowZero.stdout}\n${belowZero.stderr}`,
      /inventory_below_zero/u
    );

    const canceled = execute(`
      UPDATE orders
      SET status = 'canceled', updated_at = '2026-09-03T18:01:00.000Z'
      WHERE id = '10000000-0000-4000-8000-000000000001';
      SELECT inventory_quantity
      FROM product_variants
      WHERE id = 'hat-5950-7-1-4'
    `);
    assert.equal(canceled.status, 0, canceled.stderr || canceled.stdout);
    const cancelResult = JSON.parse(canceled.stdout) as Array<{
      results: Array<{inventory_quantity?: number}>;
    }>;
    assert.equal(cancelResult.at(-1)?.results[0]?.inventory_quantity, 2);

    assert.equal(
      execute(
        orderSql(
          '10000000-0000-4000-8000-000000000002',
          'client-2',
          'network-cap'
        )
      ).status,
      0
    );
    assert.equal(
      execute(
        orderSql(
          '10000000-0000-4000-8000-000000000003',
          'client-3',
          'network-cap'
        )
      ).status,
      0
    );
    const capped = execute(
      orderSql(
        '10000000-0000-4000-8000-000000000004',
        'client-4',
        'network-cap'
      )
    );
    assert.notEqual(capped.status, 0);
    assert.match(
      `${capped.stdout}\n${capped.stderr}`,
      /checkout_network_busy/u
    );
  } finally {
    rmSync(persistence, {force: true, recursive: true});
  }
});
