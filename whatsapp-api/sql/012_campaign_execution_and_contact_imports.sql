-- Ejecución controlada de campañas e importaciones con vista previa.
-- Ningún envío se activa por esta migración: la aplicación exige un feature flag.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS started_by UUID REFERENCES app_users(id) ON DELETE SET NULL;

ALTER TABLE campaign_recipients
  ADD COLUMN IF NOT EXISTS eligibility_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS campaign_recipients_processing_idx
  ON campaign_recipients(campaign_id, status, updated_at);

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS consent_source TEXT;

CREATE TABLE IF NOT EXISTS contact_import_batches (
  id UUID PRIMARY KEY,
  filename TEXT NOT NULL,
  source_format TEXT NOT NULL CHECK (source_format IN ('CSV','XLSX')),
  status TEXT NOT NULL CHECK (status IN ('PREVIEWED','PROCESSING','IMPORTED','CANCELLED')),
  total_rows INTEGER NOT NULL DEFAULT 0,
  valid_rows INTEGER NOT NULL DEFAULT 0,
  invalid_rows INTEGER NOT NULL DEFAULT 0,
  duplicate_rows INTEGER NOT NULL DEFAULT 0,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  imported_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  imported_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS contact_import_rows (
  id UUID PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES contact_import_batches(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  normalized_phone TEXT,
  status TEXT NOT NULL CHECK (status IN ('VALID','INVALID','DUPLICATE','IMPORTED')),
  error_message TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, row_number)
);

CREATE INDEX IF NOT EXISTS contact_import_rows_batch_status_idx
  ON contact_import_rows(batch_id, status, row_number);
