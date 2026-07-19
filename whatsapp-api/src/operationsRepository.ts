import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { pool } from './db.js';
import { AppError } from './errors/AppError.js';

export type OperationalSeverity = 'OK' | 'WARNING' | 'CRITICAL';
export type OperationalTrigger = 'MANUAL' | 'SCHEDULED' | 'STARTUP';
export type OperationalRunStatus = 'RUNNING' | 'SUCCESS' | 'WARNING' | 'CRITICAL' | 'FAILED';

export type OperationalCheck = {
  key: string;
  title: string;
  severity: OperationalSeverity;
  message: string;
  details: Record<string, unknown>;
};

export type OperationalSummary = {
  ok: number;
  warning: number;
  critical: number;
};

export type OperationalRun = {
  id: string;
  triggerSource: OperationalTrigger;
  status: OperationalRunStatus;
  checks: OperationalCheck[];
  summary: OperationalSummary;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
};

export type OperationalAlert = {
  id: string;
  severity: Exclude<OperationalSeverity, 'OK'>;
  source: string;
  title: string;
  details: Record<string, unknown>;
  fingerprint: string | null;
  occurrenceCount: number;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  lastSeenAt: string;
  updatedAt: string;
};

type RunRow = {
  id: string;
  trigger_source: OperationalTrigger;
  status: OperationalRunStatus;
  checks: OperationalCheck[];
  summary: OperationalSummary;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
};

type AlertRow = {
  id: string;
  severity: Exclude<OperationalSeverity, 'OK'>;
  source: string;
  title: string;
  details: Record<string, unknown>;
  fingerprint: string | null;
  occurrence_count: number | string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
  last_seen_at: string;
  updated_at: string;
};

type CountRow = { count: number | string };
type ReadyRecipientRow = {
  archived_at: string | null;
  commercial_status: string;
  opt_out_at: string | null;
  consent_status: string;
  wa_id: string;
  phone: string;
};
type BackupRow = {
  status: string;
  completed_at: string | null;
  verified_at: string | null;
};

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapRun(row: RunRow): OperationalRun {
  return {
    id: row.id,
    triggerSource: row.trigger_source,
    status: row.status,
    checks: Array.isArray(row.checks) ? row.checks : [],
    summary: row.summary ?? { ok: 0, warning: 0, critical: 0 },
    startedAt: row.started_at,
    completedAt: row.completed_at,
    errorMessage: row.error_message
  };
}

function mapAlert(row: AlertRow): OperationalAlert {
  return {
    id: row.id,
    severity: row.severity,
    source: row.source,
    title: row.title,
    details: row.details ?? {},
    fingerprint: row.fingerprint,
    occurrenceCount: numberValue(row.occurrence_count),
    acknowledgedAt: row.acknowledged_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    updatedAt: row.updated_at
  };
}

function summarize(checks: OperationalCheck[]): OperationalSummary {
  const summary: OperationalSummary = { ok: 0, warning: 0, critical: 0 };
  for (const check of checks) {
    if (check.severity === 'CRITICAL') summary.critical += 1;
    else if (check.severity === 'WARNING') summary.warning += 1;
    else summary.ok += 1;
  }
  return summary;
}

function statusFor(summary: OperationalSummary): OperationalRunStatus {
  if (summary.critical > 0) return 'CRITICAL';
  if (summary.warning > 0) return 'WARNING';
  return 'SUCCESS';
}

function validPhone(value: unknown): boolean {
  return typeof value === 'string' && /^[0-9]{8,20}$/.test(value);
}

async function countRows(sql: string): Promise<number> {
  const result = await pool.query<CountRow>(sql);
  return numberValue(result.rows[0]?.count);
}

async function collectChecks(): Promise<OperationalCheck[]> {
  await pool.query('SELECT 1');

  const [
    failedRecent,
    unknownStale,
    pendingStale,
    webhookErrors,
    webhookStale,
    unsafeCampaigns,
    staleCampaignSends,
    readyRecipients,
    backups
  ] = await Promise.all([
    countRows(`
      SELECT COUNT(*) AS count
      FROM messages
      WHERE direction = 'OUTBOUND'
        AND status = 'FAILED'
        AND updated_at >= NOW() - INTERVAL '24 hours'
    `),
    countRows(`
      SELECT COUNT(*) AS count
      FROM messages
      WHERE direction = 'OUTBOUND'
        AND status = 'UNKNOWN'
        AND updated_at < NOW() - INTERVAL '15 minutes'
    `),
    countRows(`
      SELECT COUNT(*) AS count
      FROM messages
      WHERE direction = 'OUTBOUND'
        AND status IN ('PENDING','SENT')
        AND updated_at < NOW() - INTERVAL '2 hours'
    `),
    countRows(`
      SELECT COUNT(*) AS count
      FROM webhook_events
      WHERE error IS NOT NULL
        AND received_at >= NOW() - INTERVAL '24 hours'
    `),
    countRows(`
      SELECT COUNT(*) AS count
      FROM webhook_events
      WHERE processed_at IS NULL
        AND received_at < NOW() - INTERVAL '10 minutes'
    `),
    countRows(`
      SELECT COUNT(*) AS count
      FROM campaigns
      WHERE status NOT IN (
          'DRAFT','PREVIEWED','APPROVED','RUNNING',
          'COMPLETED','COMPLETED_WITH_ERRORS','CANCELLED'
        )
        OR (status = 'RUNNING' AND (
          approved_by IS NULL OR started_by IS NULL OR approved_by = started_by
          ${config.CAMPAIGN_EXECUTION_ENABLED ? '' : "OR status = 'RUNNING'"}
        ))
    `),
    countRows(`
      SELECT COUNT(*) AS count
      FROM campaign_recipients
      WHERE status = 'SENDING'
        AND attempted_at < NOW() - INTERVAL '10 minutes'
    `),
    pool.query<ReadyRecipientRow>(`
      SELECT ct.archived_at,
             ct.commercial_status,
             ct.opt_out_at,
             ct.consent_status,
             ct.wa_id,
             ct.phone
      FROM campaign_recipients cr
      JOIN contacts ct ON ct.id = cr.contact_id
      WHERE cr.status = 'READY'
    `),
    pool.query<BackupRow>(`
      SELECT status, completed_at, verified_at
      FROM backup_runs
      ORDER BY started_at DESC
      LIMIT 1
    `)
  ]);

  const messageProblems = failedRecent + unknownStale + pendingStale;
  const ineligibleReady = readyRecipients.rows.filter((contact) =>
    contact.archived_at !== null
    || contact.commercial_status === 'DO_NOT_CONTACT'
    || contact.opt_out_at !== null
    || contact.consent_status !== 'GRANTED'
    || !validPhone(contact.wa_id)
    || !validPhone(contact.phone)
  ).length;

  const backup = backups.rows[0];
  const verifiedAt = backup?.verified_at ? new Date(backup.verified_at).getTime() : Number.NaN;
  const backupFresh = backup?.status === 'SUCCESS'
    && Number.isFinite(verifiedAt)
    && verifiedAt >= Date.now() - 36 * 60 * 60 * 1000;

  return [
    {
      key: 'database',
      title: 'Base de datos disponible',
      severity: 'OK',
      message: 'La base de datos respondió correctamente.',
      details: {}
    },
    {
      key: 'messages',
      title: 'Estado de mensajes salientes',
      severity: messageProblems > 0 ? 'WARNING' : 'OK',
      message: messageProblems > 0
        ? 'Hay mensajes fallidos, sin confirmar o demorados que requieren revisión.'
        : 'No hay mensajes salientes demorados o fallidos dentro de los umbrales revisados.',
      details: { failedRecent, unknownStale, pendingStale }
    },
    {
      key: 'webhooks',
      title: 'Procesamiento de webhooks',
      severity: webhookErrors + webhookStale > 0 ? 'WARNING' : 'OK',
      message: webhookErrors + webhookStale > 0
        ? 'Hay eventos con error o sin terminar de procesar.'
        : 'Los eventos recientes fueron procesados sin atrasos detectados.',
      details: { errorsRecent: webhookErrors, unprocessedStale: webhookStale }
    },
    {
      key: 'campaign_safety',
      title: 'Bloqueo de campañas',
      severity: unsafeCampaigns + staleCampaignSends > 0 ? 'CRITICAL' : 'OK',
      message: unsafeCampaigns + staleCampaignSends > 0
        ? 'Se detectaron campañas sin doble control o envíos cuyo resultado quedó pendiente.'
        : config.CAMPAIGN_EXECUTION_ENABLED
          ? 'Las campañas activas cumplen el doble control y no hay envíos bloqueados.'
          : 'La ejecución está desactivada y no hay campañas corriendo.',
      details: {
        unsafeCampaigns,
        staleCampaignSends,
        executionEnabled: config.CAMPAIGN_EXECUTION_ENABLED
      }
    },
    {
      key: 'campaign_eligibility',
      title: 'Elegibilidad de destinatarios',
      severity: ineligibleReady > 0 ? 'CRITICAL' : 'OK',
      message: ineligibleReady > 0
        ? 'Hay destinatarios marcados como listos que no cumplen las reglas de consentimiento.'
        : 'No hay destinatarios no habilitados marcados como listos.',
      details: { ineligibleReady }
    },
    {
      key: 'backups',
      title: 'Respaldo verificado',
      severity: backupFresh ? 'OK' : 'WARNING',
      message: backupFresh
        ? 'Existe un respaldo exitoso y verificado dentro de las últimas 36 horas.'
        : 'No existe un respaldo exitoso y verificado dentro de las últimas 36 horas.',
      details: {
        latestStatus: backup?.status ?? null,
        completedAt: backup?.completed_at ?? null,
        verifiedAt: backup?.verified_at ?? null
      }
    }
  ];
}

async function updateAlert(check: OperationalCheck): Promise<void> {
  const fingerprint = `operations:${check.key}`;
  if (check.severity === 'OK') {
    await pool.query(
      `UPDATE system_alerts
       SET resolved_at = COALESCE(resolved_at, NOW()),
           updated_at = NOW()
       WHERE fingerprint = $1
         AND resolved_at IS NULL`,
      [fingerprint]
    );
    return;
  }

  const updated = await pool.query(
    `UPDATE system_alerts
     SET severity = $2,
         title = $3,
         details = $4::jsonb,
         occurrence_count = occurrence_count + 1,
         last_seen_at = NOW(),
         acknowledged_at = NULL,
         acknowledged_by = NULL,
         updated_at = NOW()
     WHERE fingerprint = $1
       AND resolved_at IS NULL
     RETURNING id`,
    [fingerprint, check.severity, check.title, JSON.stringify(check.details)]
  );
  if (updated.rowCount === 1) return;

  try {
    await pool.query(
      `INSERT INTO system_alerts (
         id, severity, source, title, details, fingerprint,
         occurrence_count, last_seen_at, created_at, updated_at
       ) VALUES ($1, $2, 'operations-monitor', $3, $4::jsonb, $5, 1, NOW(), NOW(), NOW())`,
      [randomUUID(), check.severity, check.title, JSON.stringify(check.details), fingerprint]
    );
  } catch (error) {
    if ((error as { code?: unknown }).code !== '23505') throw error;
    await pool.query(
      `UPDATE system_alerts
       SET severity = $2,
           title = $3,
           details = $4::jsonb,
           occurrence_count = occurrence_count + 1,
           last_seen_at = NOW(),
           acknowledged_at = NULL,
           acknowledged_by = NULL,
           updated_at = NOW()
       WHERE fingerprint = $1
         AND resolved_at IS NULL`,
      [fingerprint, check.severity, check.title, JSON.stringify(check.details)]
    );
  }
}

export async function runOperationalChecks(triggerSource: OperationalTrigger): Promise<OperationalRun> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO operational_check_runs (id, trigger_source, status)
     VALUES ($1, $2, 'RUNNING')`,
    [id, triggerSource]
  );

  try {
    const checks = await collectChecks();
    const summary = summarize(checks);
    const status = statusFor(summary);
    for (const check of checks) await updateAlert(check);

    const result = await pool.query<RunRow>(
      `UPDATE operational_check_runs
       SET status = $2,
           checks = $3::jsonb,
           summary = $4::jsonb,
           completed_at = NOW()
       WHERE id = $1
       RETURNING id, trigger_source, status, checks, summary,
                 started_at, completed_at, error_message`,
      [id, status, JSON.stringify(checks), JSON.stringify(summary)]
    );
    const row = result.rows[0];
    if (!row) throw new AppError('No se pudo guardar la verificación operativa.', 500);
    return mapRun(row);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await pool.query(
      `UPDATE operational_check_runs
       SET status = 'FAILED',
           error_message = $2,
           completed_at = NOW()
       WHERE id = $1`,
      [id, message.slice(0, 2000)]
    ).catch(() => undefined);
    throw error;
  }
}

export async function listOperationalRuns(limit: number): Promise<OperationalRun[]> {
  const result = await pool.query<RunRow>(
    `SELECT id, trigger_source, status, checks, summary,
            started_at, completed_at, error_message
     FROM operational_check_runs
     ORDER BY started_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows.map(mapRun);
}

export async function listOperationalAlerts(params: {
  includeResolved: boolean;
  limit: number;
}): Promise<OperationalAlert[]> {
  const result = await pool.query<AlertRow>(
    `SELECT id, severity, source, title, details, fingerprint,
            occurrence_count, acknowledged_at, resolved_at,
            created_at, last_seen_at, updated_at
     FROM system_alerts
     WHERE ($1::boolean = TRUE OR resolved_at IS NULL)
     ORDER BY
       CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'WARNING' THEN 1 ELSE 2 END,
       last_seen_at DESC
     LIMIT $2`,
    [params.includeResolved, params.limit]
  );
  return result.rows.map(mapAlert);
}

async function alertById(id: string): Promise<OperationalAlert> {
  const result = await pool.query<AlertRow>(
    `SELECT id, severity, source, title, details, fingerprint,
            occurrence_count, acknowledged_at, resolved_at,
            created_at, last_seen_at, updated_at
     FROM system_alerts
     WHERE id = $1`,
    [id]
  );
  const row = result.rows[0];
  if (!row) throw new AppError('Alerta operativa no encontrada.', 404);
  return mapAlert(row);
}

export async function acknowledgeOperationalAlert(id: string): Promise<OperationalAlert> {
  const result = await pool.query(
    `UPDATE system_alerts
     SET acknowledged_at = COALESCE(acknowledged_at, NOW()),
         updated_at = NOW()
     WHERE id = $1
       AND resolved_at IS NULL
     RETURNING id`,
    [id]
  );
  if (result.rowCount !== 1) {
    const existing = await alertById(id);
    if (existing.resolvedAt) throw new AppError('La alerta ya está resuelta.', 409);
  }
  return alertById(id);
}

export async function resolveOperationalAlert(id: string): Promise<OperationalAlert> {
  const result = await pool.query(
    `UPDATE system_alerts
     SET resolved_at = COALESCE(resolved_at, NOW()),
         updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [id]
  );
  if (result.rowCount !== 1) throw new AppError('Alerta operativa no encontrada.', 404);
  return alertById(id);
}

export async function getOperationalOverview(): Promise<{
  latestRun: OperationalRun | null;
  alerts: OperationalAlert[];
}> {
  const [runs, alerts] = await Promise.all([
    listOperationalRuns(1),
    listOperationalAlerts({ includeResolved: false, limit: 100 })
  ]);
  return { latestRun: runs[0] ?? null, alerts };
}
