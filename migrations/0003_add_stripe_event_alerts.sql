ALTER TABLE orders ADD COLUMN payment_cancel_failed_at TEXT;
ALTER TABLE orders ADD COLUMN checkout_client_hash TEXT;
ALTER TABLE orders ADD COLUMN checkout_network_hash TEXT;

CREATE INDEX orders_checkout_session_status
ON orders(checkout_client_hash, status);

CREATE INDEX orders_checkout_network_status
ON orders(checkout_network_hash, status);

CREATE TRIGGER limit_active_checkout_reservations
BEFORE INSERT ON orders
WHEN NEW.checkout_client_hash IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM orders
    WHERE checkout_client_hash = NEW.checkout_client_hash
      AND status IN ('creating_payment', 'awaiting_payment')
  )
BEGIN
  SELECT RAISE(ABORT, 'checkout_already_active');
END;

CREATE TRIGGER limit_active_checkout_network
BEFORE INSERT ON orders
WHEN NEW.checkout_network_hash IS NOT NULL
  AND (
    SELECT COUNT(*)
    FROM orders
    WHERE checkout_network_hash = NEW.checkout_network_hash
      AND status IN ('creating_payment', 'awaiting_payment')
  ) >= 2
BEGIN
  SELECT RAISE(ABORT, 'checkout_network_busy');
END;

CREATE TRIGGER limit_active_checkout_global
BEFORE INSERT ON orders
WHEN (
  SELECT COUNT(*)
  FROM orders
  WHERE status IN ('creating_payment', 'awaiting_payment')
) >= 20
BEGIN
  SELECT RAISE(ABORT, 'checkout_store_busy');
END;

CREATE TABLE stripe_event_alerts (
  event_id TEXT PRIMARY KEY REFERENCES stripe_events(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('investigate', 'refund')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  order_id TEXT NOT NULL,
  payment_intent_id TEXT NOT NULL,
  amount_received INTEGER,
  currency TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX stripe_event_alerts_status_action
ON stripe_event_alerts(status, action, created_at);
