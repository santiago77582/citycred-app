CREATE TABLE IF NOT EXISTS meta_account_events (
  id UUID PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  waba_id TEXT,
  field TEXT NOT NULL,
  event TEXT,
  display_phone_number TEXT,
  current_limit TEXT,
  decision TEXT,
  requested_verified_name TEXT,
  rejection_reason TEXT,
  payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS meta_account_events_field_received_idx
  ON meta_account_events(field, received_at DESC);

CREATE INDEX IF NOT EXISTS meta_account_events_phone_received_idx
  ON meta_account_events(display_phone_number, received_at DESC);
