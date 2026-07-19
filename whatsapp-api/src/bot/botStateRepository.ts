import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { AppError } from '../errors/AppError.js';
import type { BotContactState, BotDecision, BotStage } from './citycredBotEngineV2.js';

export type BotRuntimeSettings = {
  botEnabled: boolean;
  followupsEnabled: boolean;
  businessTimezone: string;
  businessHourStart: number;
  businessHourEnd: number;
  updatedAt: string;
};

export async function getBotStateByWaId(waId: string): Promise<{
  contactId: string;
  conversationId: string;
  state: BotContactState;
  paused: boolean;
}> {
  const result = await pool.query<{
    contact_id: string;
    conversation_id: string;
    stage: BotStage;
    entity: string | null;
    personnel_type: string | null;
    seniority_range: string | null;
    available_quota: string | number | null;
    profile_name: string | null;
    document_number: string | null;
    commercial_status: string;
    bot_context: Record<string, unknown> | null;
    bot_paused_until: string | null;
  }>(
    `SELECT ct.id AS contact_id, c.id AS conversation_id,
            ct.bot_stage AS stage, ct.entity, ct.personnel_type,
            ct.seniority_range, ct.available_quota, ct.profile_name,
            ct.document_number, ct.commercial_status, ct.bot_context,
            c.bot_paused_until
     FROM contacts ct
     JOIN conversations c ON c.contact_id = ct.id
     WHERE ct.wa_id = $1 AND ct.archived_at IS NULL`,
    [waId]
  );
  const row = result.rows[0];
  if (!row) throw new AppError('No se encontró la conversación para ejecutar el bot.', 404);
  return {
    contactId: row.contact_id,
    conversationId: row.conversation_id,
    paused: Boolean(row.bot_paused_until && new Date(row.bot_paused_until).getTime() > Date.now()),
    state: {
      stage: row.stage ?? 'START',
      entity: row.entity,
      personnelType: row.personnel_type,
      seniorityRange: row.seniority_range,
      availableQuota: row.available_quota === null ? null : Number(row.available_quota),
      profileName: row.profile_name,
      documentNumber: row.document_number,
      commercialStatus: row.commercial_status,
      context: row.bot_context ?? {}
    }
  };
}

export async function getBotRuntimeSettings(): Promise<BotRuntimeSettings> {
  const result = await pool.query<{
    bot_enabled: boolean;
    followups_enabled: boolean;
    business_timezone: string;
    business_hour_start: number;
    business_hour_end: number;
    updated_at: string;
  }>(
    `SELECT bot_enabled, followups_enabled, business_timezone,
            business_hour_start, business_hour_end, updated_at
     FROM bot_runtime_settings WHERE id = 'citycred'`
  );
  const row = result.rows[0];
  if (!row) throw new AppError('No se encontró la configuración del bot.', 500);
  return {
    botEnabled: row.bot_enabled,
    followupsEnabled: row.followups_enabled,
    businessTimezone: row.business_timezone,
    businessHourStart: row.business_hour_start,
    businessHourEnd: row.business_hour_end,
    updatedAt: row.updated_at
  };
}

export async function updateBotRuntimeSettings(params: {
  botEnabled?: boolean;
  followupsEnabled?: boolean;
  businessHourStart?: number;
  businessHourEnd?: number;
  actorUserId?: string | null;
}): Promise<BotRuntimeSettings> {
  await pool.query(
    `UPDATE bot_runtime_settings SET
       bot_enabled = COALESCE($1, bot_enabled),
       followups_enabled = COALESCE($2, followups_enabled),
       business_hour_start = COALESCE($3, business_hour_start),
       business_hour_end = COALESCE($4, business_hour_end),
       updated_by = $5, updated_at = NOW()
     WHERE id = 'citycred'`,
    [
      params.botEnabled ?? null,
      params.followupsEnabled ?? null,
      params.businessHourStart ?? null,
      params.businessHourEnd ?? null,
      params.actorUserId ?? null
    ]
  );
  return getBotRuntimeSettings();
}

export async function applyBotDecision(params: {
  contactId: string;
  conversationId: string;
  inboundMessageId: string;
  previousStage: BotStage;
  decision: BotDecision;
}): Promise<void> {
  const patch = params.decision.patch;
  await pool.query(
    `UPDATE contacts SET
       bot_stage = $2,
       entity = CASE WHEN $3::boolean THEN $4 ELSE entity END,
       personnel_type = CASE WHEN $5::boolean THEN $6 ELSE personnel_type END,
       seniority_range = CASE WHEN $7::boolean THEN $8 ELSE seniority_range END,
       available_quota = CASE WHEN $9::boolean THEN $10 ELSE available_quota END,
       profile_name = CASE WHEN $11::boolean THEN $12 ELSE profile_name END,
       document_number = CASE WHEN $13::boolean THEN $14 ELSE document_number END,
       commercial_status = COALESCE($15, commercial_status),
       bot_context = CASE WHEN $16::boolean THEN $17::jsonb ELSE bot_context END,
       bot_handoff_reason = CASE WHEN $18::boolean THEN $19 ELSE bot_handoff_reason END,
       bot_last_inbound_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [
      params.contactId, params.decision.nextStage,
      Object.hasOwn(patch, 'entity'), patch.entity ?? null,
      Object.hasOwn(patch, 'personnelType'), patch.personnelType ?? null,
      Object.hasOwn(patch, 'seniorityRange'), patch.seniorityRange ?? null,
      Object.hasOwn(patch, 'availableQuota'), patch.availableQuota ?? null,
      Object.hasOwn(patch, 'profileName'), patch.profileName ?? null,
      Object.hasOwn(patch, 'documentNumber'), patch.documentNumber ?? null,
      patch.commercialStatus ?? null,
      Object.hasOwn(patch, 'context'), JSON.stringify(patch.context ?? {}),
      Object.hasOwn(patch, 'handoffReason'), patch.handoffReason ?? null
    ]
  );
  await pool.query(
    `INSERT INTO bot_decision_logs (
       id, contact_id, conversation_id, inbound_message_id,
       previous_stage, next_stage, extracted, response, decision_reason
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)`,
    [
      randomUUID(), params.contactId, params.conversationId,
      params.inboundMessageId, params.previousStage,
      params.decision.nextStage, JSON.stringify(patch),
      JSON.stringify(params.decision.response ?? {}), params.decision.reason
    ]
  );
}

export async function markBotOutbound(contactId: string): Promise<void> {
  await pool.query(
    `UPDATE contacts SET bot_last_outbound_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [contactId]
  );
}
