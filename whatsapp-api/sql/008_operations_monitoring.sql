-- Monitoreo interno de operación. No realiza llamadas a Meta ni envía mensajes.

ALTER TABLE system_alerts
  ADD COLUMN IF NOT EXISTS fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS occurrence_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS system_alerts_open_fingerprint_unique
  ON system_alerts(fingerprint)
  WHERE fingerprint IS NOT NULL AND resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS system_alerts_open_severity_idx
  ON system_alerts(severity, last_seen_at DESC)
  WHERE resolved_at IS NULL;

CREATE TABLE IF NOT EXISTS operational_check_runs (
  id UUID PRIMARY KEY,
  trigger_source TEXT NOT NULL CHECK (trigger_source IN ('MANUAL','SCHEDULED','STARTUP')),
  status TEXT NOT NULL CHECK (status IN ('RUNNING','SUCCESS','WARNING','CRITICAL','FAILED')),
  checks JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS operational_check_runs_started_idx
  ON operational_check_runs(started_at DESC);
