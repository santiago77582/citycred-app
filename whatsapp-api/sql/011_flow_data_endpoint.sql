CREATE TABLE IF NOT EXISTS whatsapp_flow_tokens (
  id UUID PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  flow_id TEXT NOT NULL,
  wa_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','COMPLETED','REVOKED','EXPIRED')),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS whatsapp_flow_tokens_wa_id_idx
  ON whatsapp_flow_tokens(wa_id, created_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_flow_sessions (
  id UUID PRIMARY KEY,
  token_id UUID NOT NULL UNIQUE REFERENCES whatsapp_flow_tokens(id) ON DELETE CASCADE,
  current_screen TEXT,
  -- Los campos BYTEA contienen texto base64 canónico, no bytes cifrados crudos.
  encrypted_data BYTEA,
  data_iv BYTEA,
  data_tag BYTEA,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_flow_endpoint_events (
  id UUID PRIMARY KEY,
  request_fingerprint TEXT NOT NULL UNIQUE,
  token_id UUID REFERENCES whatsapp_flow_tokens(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  screen TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('PROCESSED','ACKNOWLEDGED','REJECTED','FAILED')),
  response_payload JSONB,
  error_code TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS whatsapp_flow_endpoint_events_received_idx
  ON whatsapp_flow_endpoint_events(received_at DESC);
