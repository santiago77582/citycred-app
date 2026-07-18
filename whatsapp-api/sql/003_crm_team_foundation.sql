-- CRM, equipo y trazabilidad. No activa envíos ni modifica Meta.

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN','SUPERVISOR','ADVISOR')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS app_users_email_unique_idx ON app_users (LOWER(email));

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS entity TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS document_number TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS seniority_range TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS available_quota NUMERIC(14,2);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS commercial_status TEXT NOT NULL DEFAULT 'NEW';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS consent_status TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS opt_out_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assignment_source TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS unread_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'NORMAL';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_outbound_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS contacts_status_idx ON contacts(commercial_status);
CREATE INDEX IF NOT EXISTS contacts_entity_idx ON contacts(entity);
CREATE INDEX IF NOT EXISTS conversations_assigned_user_idx ON conversations(assigned_user_id);
CREATE INDEX IF NOT EXISTS conversations_unread_idx ON conversations(unread_count) WHERE unread_count > 0;

CREATE TABLE IF NOT EXISTS labels (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS labels_name_unique_idx ON labels (LOWER(name));

CREATE TABLE IF NOT EXISTS contact_labels (
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (contact_id, label_id)
);

CREATE TABLE IF NOT EXISTS conversation_assignments (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  assigned_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('MANUAL','AUTOMATIC','TRANSFER')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  note TEXT
);
CREATE INDEX IF NOT EXISTS conversation_assignments_conversation_idx
  ON conversation_assignments(conversation_id, started_at DESC);

CREATE TABLE IF NOT EXISTS quick_replies (
  id UUID PRIMARY KEY,
  shortcut TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS quick_replies_shortcut_unique_idx ON quick_replies (LOWER(shortcut));

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY,
  actor_user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_data JSONB,
  after_data JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_events_entity_idx ON audit_events(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON audit_events(actor_user_id, created_at DESC);
