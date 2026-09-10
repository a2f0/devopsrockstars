import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

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

function orderSql(id: string, clientHash: string, networkHash: string) {
  return `INSERT INTO orders (
    id, access_token_hash, checkout_client_hash, checkout_network_hash,
    status, currency, subtotal_amount, shipping_amount, total_amount,
    email, shipping_name, shipping_address_line1, shipping_address_line2,
    shipping_city, shipping_state, shipping_postal_code, shipping_country,
    reservation_expires_at, created_at, updated_at
  ) VALUES (
    '${id}', 'token-hash', '${clientHash}', '${networkHash}',
    'awaiting_payment', 'usd', 2000, 0, 2000,
    'test@example.com', 'Test Buyer', '1 Test Way', '',
    'New York', 'NY', '10001', 'US',
    '2026-09-03T18:10:00.000Z', '2026-09-03T18:00:00.000Z',
    '2026-09-03T18:00:00.000Z'
  )`;
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

    const reserved = execute(`
      UPDATE product_variants
      SET inventory_quantity = 2
      WHERE id = 'hat-5950-7-1-4';
      ${orderSql('10000000-0000-4000-8000-000000000001', 'client-1', 'network-1')};
      INSERT INTO order_items (
        order_id, variant_id, product_id, sku, product_name,
        variant_label, unit_amount, quantity, line_total
      ) VALUES (
        '10000000-0000-4000-8000-000000000001', 'hat-5950-7-1-4',
        'hat-5950', 'DOR-5950-7-1-4', 'DevOps Rockstars 59FIFTY',
        '7 1/4', 2000, 1, 2000
      );
      UPDATE product_variants
      SET inventory_quantity = inventory_quantity - 1
      WHERE id = 'hat-5950-7-1-4';
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
