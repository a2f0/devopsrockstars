import {expect, test} from 'bun:test';
import path from 'node:path';
import {loadCatalog} from './catalog';
import {testDatabase} from './testDatabase';

test('the migrated hat lists every size sold out at one price', async () => {
  const storage = await testDatabase();
  try {
    const {products} = await loadCatalog({DB: storage.db});
    expect(products[0]?.name).toBe('DevOpsRockstars 59FIFTY');
    const variants = products[0]?.variants ?? [];
    expect(variants.map(variant => variant.label)).toEqual([
      '6 3/8',
      '6 7/8',
      '7',
      '7 1/8',
      '7 1/4',
      '7 3/8',
      '7 1/2',
      '7 5/8',
      '7 3/4',
      '7 7/8',
      '8',
    ]);
    expect(variants[0]).toMatchObject({
      id: 'hat-5950-6-3-8',
      sku: 'DOR-5950-6-3-8',
    });
    for (const variant of variants)
      expect(variant).toMatchObject({
        availableQuantity: 0,
        currency: 'usd',
        unitAmount: 2000,
      });
  } finally {
    storage.sqlite.close();
  }
});

test('brand migration upgrades existing labels without changing commerce data', async () => {
  const {sqlite} = await testDatabase();
  try {
    const oldBrand = ['DevOps', 'Rockstars'].join(' ');
    sqlite.query('UPDATE products SET name = ?').run(`${oldBrand} 59FIFTY`);
    sqlite
      .query('UPDATE product_images SET alt_text = ?')
      .run(`${oldBrand} fitted cap`);
    sqlite.exec(`INSERT INTO orders (
      id, access_token_hash, status, currency, subtotal_amount,
      shipping_amount, total_amount, email, shipping_name,
      shipping_address_line1, shipping_city, shipping_state,
      shipping_postal_code, shipping_country, reservation_expires_at,
      paid_at, created_at, updated_at
    ) VALUES ('brand-order', 'hash', 'paid', 'usd', 2000, 0, 2000,
      'buyer@example.test', 'Test Buyer', '1 Test Way', 'New York', 'NY',
      '10001', 'US', '2026-10-25', '2026-10-25', '2026-10-25', '2026-10-25')`);
    sqlite
      .query(`INSERT INTO order_items (
        order_id, variant_id, product_id, sku, product_name, variant_label,
        unit_amount, quantity, line_total
      ) VALUES (
        'brand-order', 'hat-5950-7', 'hat-5950', 'DOR-5950-7', ?,
        '7', 2000, 1, 2000)`)
      .run(`${oldBrand} 59FIFTY`);
    const orders = sqlite.query('SELECT * FROM orders').all();
    const variants = sqlite.query('SELECT * FROM product_variants').all();
    const items = sqlite
      .query<Record<string, unknown>, []>('SELECT * FROM order_items')
      .all();
    const migration = await Bun.file(
      path.join(import.meta.dir, '../migrations/0008_normalize_brand_name.sql')
    ).text();
    sqlite.exec(migration);
    expect(sqlite.query('SELECT name FROM products').get()).toEqual({
      name: 'DevOpsRockstars 59FIFTY',
    });
    expect(sqlite.query('SELECT alt_text FROM product_images').get()).toEqual({
      alt_text: 'DevOpsRockstars fitted cap',
    });
    expect(sqlite.query('SELECT * FROM order_items').all()).toEqual(
      items.map(item => ({...item, product_name: 'DevOpsRockstars 59FIFTY'}))
    );
    expect(sqlite.query('SELECT * FROM orders').all()).toEqual(orders);
    expect(sqlite.query('SELECT * FROM product_variants').all()).toEqual(
      variants
    );
    const changes = sqlite.query('SELECT total_changes() AS n').get();
    sqlite.exec(migration);
    expect(sqlite.query('SELECT total_changes() AS n').get()).toEqual(changes);
  } finally {
    sqlite.close();
  }
});
