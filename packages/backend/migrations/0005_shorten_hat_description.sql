UPDATE products
SET description =
      'Embroidered New Era Low Crown 59FIFTY'
      || char(10)
      || 'Fitted, black.',
    updated_at = '2026-09-14T00:00:00.000Z'
WHERE id = 'hat-5950'
  AND description =
      'Embroidered New Era Low Crown 59FIFTY cap.'
      || char(10)
      || 'Fitted, black.';
