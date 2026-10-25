import {expect, test} from 'bun:test';
import {loadCatalog} from './catalog';
import {testDatabase} from './testDatabase';

test('the migrated hat lists every size sold out at one price', async () => {
  const storage = await testDatabase();
  try {
    const {products} = await loadCatalog({DB: storage.db});
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
