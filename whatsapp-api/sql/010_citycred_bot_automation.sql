-- Motor conversacional y seguimientos de CityCred.
-- Todo queda desactivado por defecto y no envía mensajes hasta habilitarlo expresamente.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS personnel_type TEXT,
  ADD COLUMN IF NOT EXISTS bot_stage TEXT NOT NULL DEFAULT 'START',
  ADD COLUMN IF NOT EXISTS bot_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS bot_handoff_reason TEXT,
  ADD COLUMN IF NOT EXISTS bot_last_inbound_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bot_last_outbound_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS bot_runtime_settings (
  id TEXT PRIMARY KEY,
  bot_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  followups_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  business_timezone TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  business_hour_start INTEGER NOT NULL DEFAULT 9 CHECK (business_hour_start BETWEEN 0 AND 23),
  business_hour_end INTEGER NOT NULL DEFAULT 20 CHECK (business_hour_end BETWEEN 1 AND 24),
  updated_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO bot_runtime_settings (id)
VALUES ('citycred')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS bot_inbound_jobs (
  id UUID PRIMARY KEY,
  inbound_message_id UUID NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
  wa_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','PROCESSING','DONE','SKIPPED','FAILED')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bot_inbound_jobs_pending_idx
  ON bot_inbound_jobs(available_at, id)
  WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS bot_followups (
  id UUID PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence BETWEEN 1 AND 4),
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','PROCESSING','SENT','SKIPPED','CANCELLED','FAILED')),
  delivery_mode TEXT NOT NULL CHECK (delivery_mode IN ('TEXT','TEMPLATE')),
  template_name TEXT,
  text_body TEXT NOT NULL,
  scheduled_from_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  sent_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  skip_reason TEXT,
  error_message TEXT,
  locked_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_id, sequence, scheduled_from_message_id)
);

CREATE INDEX IF NOT EXISTS bot_followups_due_idx
  ON bot_followups(due_at, id)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS bot_followups_contact_idx
  ON bot_followups(contact_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bot_decision_logs (
  id UUID PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  inbound_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  previous_stage TEXT,
  next_stage TEXT,
  extracted JSONB NOT NULL DEFAULT '{}'::jsonb,
  response JSONB NOT NULL DEFAULT '{}'::jsonb,
  decision_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bot_decision_logs_conversation_idx
  ON bot_decision_logs(conversation_id, created_at DESC);
