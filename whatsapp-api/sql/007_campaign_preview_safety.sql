-- Campañas en modo borrador y vista previa. No agrega ejecución de envíos.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS template_components JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS preview_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_previewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS campaigns_status_updated_idx
  ON campaigns(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS contacts_campaign_eligibility_idx
  ON contacts(consent_status, commercial_status, opt_out_at)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS contact_labels_campaign_lookup_idx
  ON contact_labels(label_id, contact_id);
