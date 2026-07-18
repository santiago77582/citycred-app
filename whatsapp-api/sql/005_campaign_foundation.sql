-- Plantillas y campañas. No ejecuta envíos por sí sola.

CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id UUID PRIMARY KEY,
  meta_template_id TEXT,
  name TEXT NOT NULL,
  language_code TEXT NOT NULL,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'LOCAL_DRAFT',
  components JSONB NOT NULL DEFAULT '[]'::jsonb,
  rejection_reason TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, language_code)
);

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  template_id UUID REFERENCES whatsapp_templates(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  audience_filter JSONB NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_recipients (
  id UUID PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  skip_reason TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, contact_id)
);
CREATE INDEX IF NOT EXISTS campaign_recipients_status_idx
  ON campaign_recipients(campaign_id, status);
