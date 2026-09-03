ALTER TABLE orders ADD COLUMN payment_cancel_failed_at TEXT;

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
