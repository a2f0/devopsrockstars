CREATE TABLE products (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  manufacturer TEXT NOT NULL,
  description TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE product_images (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  alt_text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  unit_amount INTEGER NOT NULL CHECK (unit_amount >= 50),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  inventory_quantity INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TRIGGER prevent_negative_inventory
BEFORE UPDATE OF inventory_quantity ON product_variants
WHEN NEW.inventory_quantity < 0
BEGIN
  SELECT RAISE(ABORT, 'inventory_below_zero');
END;

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  access_token_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('creating_payment', 'awaiting_payment', 'paid', 'canceled')
  ),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  subtotal_amount INTEGER NOT NULL CHECK (subtotal_amount >= 0),
  shipping_amount INTEGER NOT NULL CHECK (shipping_amount >= 0),
  total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
  email TEXT NOT NULL,
  shipping_name TEXT NOT NULL,
  shipping_address_line1 TEXT NOT NULL,
  shipping_address_line2 TEXT NOT NULL DEFAULT '',
  shipping_city TEXT NOT NULL,
  shipping_state TEXT NOT NULL,
  shipping_postal_code TEXT NOT NULL,
  shipping_country TEXT NOT NULL,
  stripe_payment_intent_id TEXT UNIQUE,
  reservation_expires_at TEXT NOT NULL,
  paid_at TEXT,
  canceled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX orders_status_expiration
ON orders(status, reservation_expires_at);

CREATE TABLE order_items (
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL,
  product_name TEXT NOT NULL,
  variant_label TEXT NOT NULL,
  unit_amount INTEGER NOT NULL CHECK (unit_amount >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total INTEGER NOT NULL CHECK (line_total >= 0),
  PRIMARY KEY (order_id, variant_id)
);

CREATE TRIGGER restock_canceled_order
AFTER UPDATE OF status ON orders
WHEN OLD.status IN ('creating_payment', 'awaiting_payment')
  AND NEW.status = 'canceled'
BEGIN
  UPDATE product_variants
  SET inventory_quantity = inventory_quantity + (
    SELECT oi.quantity
    FROM order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.variant_id = product_variants.id
  ),
  updated_at = NEW.updated_at
  WHERE id IN (
    SELECT variant_id FROM order_items WHERE order_id = NEW.id
  );
END;

CREATE TABLE stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  processed_at TEXT NOT NULL
);

INSERT INTO products (
  id, slug, name, manufacturer, description, active, sort_order,
  created_at, updated_at
) VALUES (
  'hat-5950',
  'devops-rockstars-59fifty',
  'DevOps Rockstars 59FIFTY',
  'New Era',
  'Embroidered New Era Low Crown 59FIFTY cap. Fitted, black.',
  1,
  10,
  '2026-09-02T00:00:00.000Z',
  '2026-09-02T00:00:00.000Z'
);

INSERT INTO product_images (id, product_id, path, alt_text, sort_order)
VALUES (
  'hat-5950-main',
  'hat-5950',
  '/static/image/store/hat.svg',
  'DevOps Rockstars fitted cap',
  10
);

INSERT INTO product_variants (
  id, product_id, sku, label, unit_amount, currency, inventory_quantity,
  active, sort_order, created_at, updated_at
) VALUES
  ('hat-5950-6-7-8', 'hat-5950', 'DOR-5950-6-7-8', '6 7/8', 2000, 'usd', 0, 1, 10, '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z'),
  ('hat-5950-7', 'hat-5950', 'DOR-5950-7', '7', 2000, 'usd', 0, 1, 20, '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z'),
  ('hat-5950-7-1-8', 'hat-5950', 'DOR-5950-7-1-8', '7 1/8', 2000, 'usd', 0, 1, 30, '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z'),
  ('hat-5950-7-1-4', 'hat-5950', 'DOR-5950-7-1-4', '7 1/4', 2000, 'usd', 0, 1, 40, '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z'),
  ('hat-5950-7-3-8', 'hat-5950', 'DOR-5950-7-3-8', '7 3/8', 2000, 'usd', 0, 1, 50, '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z'),
  ('hat-5950-7-1-2', 'hat-5950', 'DOR-5950-7-1-2', '7 1/2', 2000, 'usd', 0, 1, 60, '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z'),
  ('hat-5950-7-5-8', 'hat-5950', 'DOR-5950-7-5-8', '7 5/8', 2000, 'usd', 0, 1, 70, '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z'),
  ('hat-5950-7-3-4', 'hat-5950', 'DOR-5950-7-3-4', '7 3/4', 2000, 'usd', 0, 1, 80, '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z'),
  ('hat-5950-7-7-8', 'hat-5950', 'DOR-5950-7-7-8', '7 7/8', 2000, 'usd', 0, 1, 90, '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z'),
  ('hat-5950-8', 'hat-5950', 'DOR-5950-8', '8', 2000, 'usd', 0, 1, 100, '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z');
