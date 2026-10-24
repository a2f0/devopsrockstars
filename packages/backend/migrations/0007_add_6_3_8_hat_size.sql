-- Lists the 6 3/8 cap ahead of 6 7/8 at the price of its neighboring size.
-- Like the original sizes it starts sold out; stock is set per environment.
INSERT INTO product_variants (
  id, product_id, sku, label, unit_amount, currency, inventory_quantity,
  active, sort_order, created_at, updated_at
)
SELECT
  'hat-5950-6-3-8',
  product_id,
  'DOR-5950-6-3-8',
  '6 3/8',
  unit_amount,
  currency,
  0,
  1,
  5,
  '2026-10-24T00:00:00.000Z',
  '2026-10-24T00:00:00.000Z'
FROM product_variants
WHERE id = 'hat-5950-6-7-8';
