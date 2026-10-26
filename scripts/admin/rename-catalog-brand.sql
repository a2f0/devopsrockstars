-- One-time catalog update for databases that already applied 0001_store.sql.
-- Preview the catalog rows and affected order-item count before applying to
-- each environment. Only display names change; IDs, URLs, prices, stock, and
-- order state stay intact.
UPDATE products
SET name = 'DevOpsRockstars 59FIFTY',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'hat-5950' AND name <> 'DevOpsRockstars 59FIFTY';

UPDATE product_images
SET alt_text = 'DevOpsRockstars fitted cap'
WHERE id = 'hat-5950-main' AND product_id = 'hat-5950'
  AND alt_text <> 'DevOpsRockstars fitted cap';

UPDATE order_items
SET product_name = 'DevOpsRockstars 59FIFTY'
WHERE product_id = 'hat-5950' AND product_name <> 'DevOpsRockstars 59FIFTY';
