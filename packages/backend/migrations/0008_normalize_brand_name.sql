-- Existing databases do not replay the updated initial seed. Normalize the
-- brand spelling in their catalog and receipt labels without changing IDs,
-- URLs, prices, inventory, or order state.
UPDATE products
SET name = 'DevOpsRockstars 59FIFTY',
    updated_at = '2026-10-26T00:00:00.000Z'
WHERE id = 'hat-5950' AND name = 'DevOps ' || 'Rockstars 59FIFTY';

UPDATE product_images
SET alt_text = 'DevOpsRockstars fitted cap'
WHERE id = 'hat-5950-main' AND product_id = 'hat-5950'
  AND alt_text = 'DevOps ' || 'Rockstars fitted cap';

-- The requested brand normalization includes existing receipt display names;
-- their purchase amounts, quantities, and payment records remain untouched.
UPDATE order_items
SET product_name = 'DevOpsRockstars 59FIFTY'
WHERE product_id = 'hat-5950'
  AND product_name = 'DevOps ' || 'Rockstars 59FIFTY';
