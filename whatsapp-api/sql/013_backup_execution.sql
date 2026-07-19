-- Ejecución y verificación de respaldos PostgreSQL.
-- La verificación del archivo y la restauración real se registran por separado.

ALTER TABLE backup_runs
  ADD COLUMN IF NOT EXISTS archive_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS restore_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS restore_tested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS restore_error_message TEXT,
  ADD COLUMN IF NOT EXISTS restore_target_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS backup_runs_single_running_idx
  ON backup_runs(status)
  WHERE status = 'RUNNING';

CREATE INDEX IF NOT EXISTS backup_runs_started_idx
  ON backup_runs(started_at DESC);

UPDATE system_alerts
SET resolved_at = COALESCE(resolved_at, NOW()), updated_at = NOW()
WHERE fingerprint = 'operations:backups' AND resolved_at IS NULL;
