ALTER TABLE orders ADD COLUMN payment_cancel_failed_at TEXT;
ALTER TABLE orders ADD COLUMN checkout_client_hash TEXT;

CREATE INDEX orders_checkout_client_status
ON orders(checkout_client_hash, status);

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
  SELECT RAISE(ABORT, 'checkout_rate_limited');
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
