import { pool } from './db.js';
import { config } from './config.js';
import { AppError } from './errors/AppError.js';
import {
  campaignExclusionReason,
  getCampaignById,
  type Campaign,
  type CampaignEligibilityContact
} from './campaignRepository.js';
import { writeAuditEvent } from './repositories/auditRepository.js';

export type CampaignExecutionCapabilities = {
  enabled: boolean;
  maxRecipients: number;
  previewTtlMinutes: number;
  timeZone: string;
  sendWindow: { startHour: number; endHour: number; weekdaysOnly: true };
};

export type CampaignSimulation = {
  campaignId: string;
  simulatedAt: string;
  previewFresh: boolean;
  templateReady: boolean;
  readyCount: number;
  eligibleCount: number;
  newlyExcludedCount: number;
  newlyExcludedReasons: Record<string, number>;
  newlyExcludedRecipientIds: Array<{ recipientId: string; reason: string }>;
  withinRecipientLimit: boolean;
  noMessagesSent: true;
};

type SimulationRow = CampaignEligibilityContact & {
  recipient_id: string;
};

export type ClaimedCampaignRecipient = {
  recipientId: string;
  campaignId: string;
  contactId: string;
  waId: string;
  templateName: string;
  languageCode: string;
  templateComponents: unknown[];
};

export function campaignExecutionCapabilities(): CampaignExecutionCapabilities {
  return {
    enabled: config.CAMPAIGN_EXECUTION_ENABLED,
    maxRecipients: config.CAMPAIGN_MAX_RECIPIENTS,
    previewTtlMinutes: config.CAMPAIGN_PREVIEW_TTL_MINUTES,
    timeZone: config.CAMPAIGN_TIME_ZONE,
    sendWindow: {
      startHour: config.CAMPAIGN_SEND_WINDOW_START_HOUR,
      endHour: config.CAMPAIGN_SEND_WINDOW_END_HOUR,
      weekdaysOnly: true
    }
  };
}

function previewIsFresh(campaign: Campaign, now = new Date()): boolean {
  if (!campaign.lastPreviewedAt) return false;
  const ageMs = now.getTime() - new Date(campaign.lastPreviewedAt).getTime();
  return ageMs >= 0 && ageMs <= config.CAMPAIGN_PREVIEW_TTL_MINUTES * 60_000;
}

export function isCampaignSendTime(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: config.CAMPAIGN_TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === 'weekday')?.value;
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? -1);
  return weekday !== 'Sat'
    && weekday !== 'Sun'
    && hour >= config.CAMPAIGN_SEND_WINDOW_START_HOUR
    && hour < config.CAMPAIGN_SEND_WINDOW_END_HOUR;
}

function assertPreviewFresh(campaign: Campaign): void {
  if (!previewIsFresh(campaign)) {
    throw new AppError(
      `La vista previa venció. Generala nuevamente; dura ${config.CAMPAIGN_PREVIEW_TTL_MINUTES} minutos.`,
      409
    );
  }
}

function assertTemplateReady(campaign: Campaign): void {
  if (campaign.template.status !== 'APPROVED' || !campaign.template.lastSyncedAt) {
    throw new AppError('La plantilla ya no está aprobada y sincronizada.', 409);
  }
}

export async function simulateCampaignExecution(
  campaignId: string,
  actorUserId?: string | null
): Promise<CampaignSimulation> {
  const campaign = await getCampaignById(campaignId);
  if (!['PREVIEWED', 'APPROVED'].includes(campaign.status)) {
    throw new AppError('La campaña necesita una vista previa antes de simularse.', 409);
  }

  const result = await pool.query<SimulationRow>(
    `SELECT cr.id AS recipient_id, ct.id, ct.wa_id, ct.phone, ct.profile_name,
            ct.entity, ct.commercial_status, ct.consent_status,
            ct.opt_out_at, ct.archived_at
     FROM campaign_recipients cr
     JOIN contacts ct ON ct.id = cr.contact_id
     WHERE cr.campaign_id = $1 AND cr.status = 'READY'
     ORDER BY cr.created_at ASC, cr.id ASC`,
    [campaignId]
  );

  const newlyExcludedReasons: Record<string, number> = {};
  const newlyExcludedRecipientIds: CampaignSimulation['newlyExcludedRecipientIds'] = [];
  for (const row of result.rows) {
    const reason = campaignExclusionReason(row);
    if (!reason) continue;
    newlyExcludedReasons[reason] = (newlyExcludedReasons[reason] ?? 0) + 1;
    newlyExcludedRecipientIds.push({ recipientId: row.recipient_id, reason });
  }

  const simulation: CampaignSimulation = {
    campaignId,
    simulatedAt: new Date().toISOString(),
    previewFresh: previewIsFresh(campaign),
    templateReady: campaign.template.status === 'APPROVED' && Boolean(campaign.template.lastSyncedAt),
    readyCount: result.rows.length,
    eligibleCount: result.rows.length - newlyExcludedRecipientIds.length,
    newlyExcludedCount: newlyExcludedRecipientIds.length,
    newlyExcludedReasons,
    newlyExcludedRecipientIds,
    withinRecipientLimit: result.rows.length <= config.CAMPAIGN_MAX_RECIPIENTS,
    noMessagesSent: true
  };
  await writeAuditEvent({
    actorUserId,
    action: 'CAMPAIGN_EXECUTION_SIMULATED',
    entityType: 'CAMPAIGN',
    entityId: campaignId,
    afterData: { ...simulation, newlyExcludedRecipientIds: undefined }
  });
  return simulation;
}

export async function approveCampaignExecution(
  campaignId: string,
  actorUserId: string
): Promise<Campaign> {
  const before = await getCampaignById(campaignId);
  if (before.status !== 'PREVIEWED') {
    throw new AppError('Solo se puede aprobar una campaña con vista previa vigente.', 409);
  }
  if (before.createdBy && before.createdBy === actorUserId) {
    throw new AppError('El creador no puede aprobar su propia campaña.', 409);
  }
  assertPreviewFresh(before);
  assertTemplateReady(before);
  const simulation = await simulateCampaignExecution(campaignId, actorUserId);
  if (!simulation.withinRecipientLimit) {
    throw new AppError(
      `La campaña supera el máximo de ${config.CAMPAIGN_MAX_RECIPIENTS} destinatarios.`,
      409
    );
  }
  if (simulation.eligibleCount < 1 || simulation.newlyExcludedCount > 0) {
    throw new AppError(
      'La audiencia cambió o quedó vacía. Generá una nueva vista previa antes de aprobar.',
      409
    );
  }

  const updated = await pool.query(
    `UPDATE campaigns SET
       status = 'APPROVED', approved_by = $2, approved_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'PREVIEWED'
     RETURNING id`,
    [campaignId, actorUserId]
  );
  if (updated.rowCount !== 1) {
    throw new AppError('La campaña cambió mientras se aprobaba. Volvé a revisarla.', 409);
  }
  const after = await getCampaignById(campaignId);
  await writeAuditEvent({
    actorUserId,
    action: 'CAMPAIGN_EXECUTION_APPROVED',
    entityType: 'CAMPAIGN',
    entityId: campaignId,
    beforeData: before,
    afterData: after
  });
  return after;
}

export async function startCampaignExecution(
  campaignId: string,
  actorUserId: string,
  now = new Date()
): Promise<Campaign> {
  if (!config.CAMPAIGN_EXECUTION_ENABLED) {
    throw new AppError('La ejecución de campañas está desactivada por configuración.', 409);
  }
  const before = await getCampaignById(campaignId);
  if (before.status !== 'APPROVED' || !before.approvedBy || !before.approvedAt) {
    throw new AppError('La campaña necesita aprobación independiente antes de ejecutarse.', 409);
  }
  if (before.approvedBy === actorUserId) {
    throw new AppError('Quien aprobó la campaña no puede iniciar su ejecución.', 409);
  }
  assertPreviewFresh(before);
  assertTemplateReady(before);
  if (!isCampaignSendTime(now)) {
    throw new AppError(
      `La ejecución solo puede iniciarse de lunes a viernes, de ${config.CAMPAIGN_SEND_WINDOW_START_HOUR}:00 a ${config.CAMPAIGN_SEND_WINDOW_END_HOUR}:00 (${config.CAMPAIGN_TIME_ZONE}).`,
      409
    );
  }

  const simulation = await simulateCampaignExecution(campaignId, actorUserId);
  if (!simulation.withinRecipientLimit || simulation.eligibleCount < 1) {
    throw new AppError('La audiencia no cumple los límites para ejecutar la campaña.', 409);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const excluded of simulation.newlyExcludedRecipientIds) {
      await client.query(
        `UPDATE campaign_recipients SET
           status = 'SKIPPED', skip_reason = $2,
           eligibility_checked_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status = 'READY'`,
        [excluded.recipientId, excluded.reason]
      );
    }
    const remaining = await client.query<{ total: string | number }>(
      `SELECT COUNT(*) AS total FROM campaign_recipients
       WHERE campaign_id = $1 AND status = 'READY'`,
      [campaignId]
    );
    if (Number(remaining.rows[0]?.total ?? 0) < 1) {
      throw new AppError('No quedan destinatarios habilitados para ejecutar.', 409);
    }
    const updated = await client.query(
      `UPDATE campaigns SET
         status = 'RUNNING', started_by = $2, started_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'APPROVED'
       RETURNING id`,
      [campaignId, actorUserId]
    );
    if (updated.rowCount !== 1) {
      throw new AppError('La campaña cambió mientras se iniciaba.', 409);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  const after = await getCampaignById(campaignId);
  await writeAuditEvent({
    actorUserId,
    action: 'CAMPAIGN_EXECUTION_STARTED',
    entityType: 'CAMPAIGN',
    entityId: campaignId,
    beforeData: before,
    afterData: after
  });
  return after;
}

export async function claimNextCampaignRecipient(): Promise<ClaimedCampaignRecipient | null> {
  const candidates = await pool.query<{
    recipient_id: string;
    campaign_id: string;
    contact_id: string;
    wa_id: string;
    template_name: string;
    language_code: string;
    template_components: unknown[];
  }>(
    `SELECT cr.id AS recipient_id, cr.campaign_id, cr.contact_id, ct.wa_id,
            t.name AS template_name, t.language_code, c.template_components
     FROM campaign_recipients cr
     JOIN campaigns c ON c.id = cr.campaign_id
     JOIN contacts ct ON ct.id = cr.contact_id
     JOIN whatsapp_templates t ON t.id = c.template_id
     WHERE c.status = 'RUNNING' AND cr.status = 'READY'
     ORDER BY c.started_at ASC, cr.created_at ASC, cr.id ASC
     LIMIT 1`
  );
  const row = candidates.rows[0];
  if (!row) return null;
  const claimed = await pool.query(
    `UPDATE campaign_recipients SET
       status = 'SENDING', attempted_at = NOW(),
       eligibility_checked_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'READY'
     RETURNING id`,
    [row.recipient_id]
  );
  if (claimed.rowCount !== 1) return null;
  return {
    recipientId: row.recipient_id,
    campaignId: row.campaign_id,
    contactId: row.contact_id,
    waId: row.wa_id,
    templateName: row.template_name,
    languageCode: row.language_code,
    templateComponents: Array.isArray(row.template_components) ? row.template_components : []
  };
}

export async function checkClaimedCampaignRecipient(
  claimed: ClaimedCampaignRecipient
): Promise<{ eligible: boolean; reason: string | null }> {
  const result = await pool.query<CampaignEligibilityContact & {
    campaign_status: string;
    template_status: string;
    template_last_synced_at: string | null;
  }>(
    `SELECT ct.id, ct.wa_id, ct.phone, ct.profile_name, ct.entity,
            ct.commercial_status, ct.consent_status, ct.opt_out_at, ct.archived_at,
            c.status AS campaign_status, t.status AS template_status,
            t.last_synced_at AS template_last_synced_at
     FROM contacts ct
     JOIN campaigns c ON c.id = $2
     JOIN whatsapp_templates t ON t.id = c.template_id
     WHERE ct.id = $1`,
    [claimed.contactId, claimed.campaignId]
  );
  const row = result.rows[0];
  if (!row) return { eligible: false, reason: 'CONTACT_MISSING' };
  if (row.campaign_status !== 'RUNNING') return { eligible: false, reason: 'CAMPAIGN_NOT_RUNNING' };
  if (row.template_status !== 'APPROVED' || !row.template_last_synced_at) {
    return { eligible: false, reason: 'TEMPLATE_NOT_APPROVED' };
  }
  const reason = campaignExclusionReason(row);
  return { eligible: !reason, reason };
}

export async function finishCampaignRecipient(params: {
  recipientId: string;
  status: 'SENT' | 'SKIPPED' | 'FAILED' | 'UNKNOWN';
  messageId?: string | null;
  reason?: string | null;
  error?: string | null;
}): Promise<void> {
  await pool.query(
    `UPDATE campaign_recipients SET
       status = $2, message_id = $3, skip_reason = $4,
       error_message = $5,
       sent_at = CASE WHEN $2 = 'SENT' THEN NOW() ELSE sent_at END,
       updated_at = NOW()
     WHERE id = $1 AND status = 'SENDING'`,
    [
      params.recipientId,
      params.status,
      params.messageId ?? null,
      params.reason ?? null,
      params.error?.slice(0, 1000) ?? null
    ]
  );
}

export async function finalizeCompletedCampaigns(): Promise<number> {
  const campaigns = await pool.query<{ id: string }>(
    `SELECT id FROM campaigns WHERE status = 'RUNNING' ORDER BY started_at ASC`
  );
  let completed = 0;
  for (const campaign of campaigns.rows) {
    const pending = await pool.query<{ total: string | number }>(
      `SELECT COUNT(*) AS total FROM campaign_recipients
       WHERE campaign_id = $1 AND status IN ('READY','SENDING')`,
      [campaign.id]
    );
    if (Number(pending.rows[0]?.total ?? 0) > 0) continue;
    const problems = await pool.query<{ total: string | number }>(
      `SELECT COUNT(*) AS total FROM campaign_recipients
       WHERE campaign_id = $1 AND status IN ('FAILED','UNKNOWN')`,
      [campaign.id]
    );
    const status = Number(problems.rows[0]?.total ?? 0) > 0
      ? 'COMPLETED_WITH_ERRORS'
      : 'COMPLETED';
    const updated = await pool.query(
      `UPDATE campaigns SET status = $2, completed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'RUNNING'`,
      [campaign.id, status]
    );
    completed += updated.rowCount ?? 0;
  }
  return completed;
}

export async function recoverStaleCampaignRecipients(): Promise<number> {
  const result = await pool.query(
    `UPDATE campaign_recipients SET
       status = 'UNKNOWN',
       error_message = COALESCE(error_message,
         'El proceso se interrumpió durante el envío; no se reintentó para evitar duplicados.'),
       updated_at = NOW()
     WHERE status = 'SENDING'
       AND attempted_at < NOW() - INTERVAL '10 minutes'`
  );
  return result.rowCount ?? 0;
}
