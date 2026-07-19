import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';

export type DueFollowup = {
  id: string;
  contactId: string;
  conversationId: string;
  waId: string;
  profileName: string | null;
  entity: string | null;
  sequence: number;
  deliveryMode: 'TEXT' | 'TEMPLATE';
  templateName: string | null;
  textBody: string;
  dueAt: string;
  createdAt: string;
};

export async function cancelPendingFollowups(
  conversationId: string,
  reason: string
): Promise<number> {
  const result = await pool.query(
    `UPDATE bot_followups
     SET status = 'CANCELLED', skip_reason = $2, updated_at = NOW()
     WHERE conversation_id = $1 AND status = 'PENDING'`,
    [conversationId, reason]
  );
  return result.rowCount ?? 0;
}

function definitions(profileName: string | null) {
  const firstName = profileName?.trim().split(/\s+/)[0] || '¿cómo estás?';
  return [
    {
      sequence: 1,
      delayMs: 3 * 60 * 60 * 1000,
      mode: 'TEXT' as const,
      template: null,
      body: `Hola ${firstName}. ¿Pudiste avanzar con los datos que te pidió CityCred? Respondeme por acá y seguimos.`
    },
    {
      sequence: 2,
      delayMs: 24 * 60 * 60 * 1000,
      mode: 'TEMPLATE' as const,
      template: 'seguimiento_pendiente_citycred',
      body: 'Seguimiento pendiente de CityCred.'
    },
    {
      sequence: 3,
      delayMs: 48 * 60 * 60 * 1000,
      mode: 'TEMPLATE' as const,
      template: 'seguimiento_pendiente_citycred',
      body: 'Segundo seguimiento pendiente de CityCred.'
    },
    {
      sequence: 4,
      delayMs: 7 * 24 * 60 * 60 * 1000,
      mode: 'TEMPLATE' as const,
      template: 'reactivacion_consulta_citycred',
      body: 'Último seguimiento automático de CityCred.'
    }
  ];
}

export async function scheduleCitycredFollowups(params: {
  contactId: string;
  conversationId: string;
  outboundMessageId: string | null;
  profileName: string | null;
  baseTime?: Date;
}): Promise<number> {
  if (!params.outboundMessageId) return 0;
  await cancelPendingFollowups(params.conversationId, 'rescheduled_after_bot_reply');
  const base = params.baseTime ?? new Date();
  let inserted = 0;
  for (const item of definitions(params.profileName)) {
    const result = await pool.query(
      `INSERT INTO bot_followups (
         id, contact_id, conversation_id, sequence, due_at,
         delivery_mode, template_name, text_body, scheduled_from_message_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (conversation_id, sequence, scheduled_from_message_id) DO NOTHING
       RETURNING id`,
      [
        randomUUID(), params.contactId, params.conversationId, item.sequence,
        new Date(base.getTime() + item.delayMs), item.mode, item.template,
        item.body, params.outboundMessageId
      ]
    );
    if (result.rowCount === 1) inserted += 1;
  }
  return inserted;
}

export async function listBotFollowups(params: {
  limit: number;
  status?: string;
  waId?: string;
}) {
  const values: unknown[] = [];
  const filters: string[] = [];
  if (params.status) {
    values.push(params.status);
    filters.push(`bf.status = $${values.length}`);
  }
  if (params.waId) {
    values.push(params.waId);
    filters.push(`ct.wa_id = $${values.length}`);
  }
  values.push(params.limit);
  const result = await pool.query(
    `SELECT bf.id, bf.sequence, bf.due_at, bf.status, bf.delivery_mode,
            bf.template_name, bf.text_body, bf.attempt_count, bf.skip_reason,
            bf.error_message, bf.sent_at, bf.created_at,
            ct.wa_id, ct.profile_name, ct.entity
     FROM bot_followups bf
     JOIN contacts ct ON ct.id = bf.contact_id
     ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
     ORDER BY bf.due_at ASC, bf.id ASC
     LIMIT $${values.length}`,
    values
  );
  return result.rows;
}

export async function claimDueFollowups(limit: number): Promise<DueFollowup[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{
      id: string;
      contact_id: string;
      conversation_id: string;
      wa_id: string;
      profile_name: string | null;
      entity: string | null;
      sequence: number;
      delivery_mode: 'TEXT' | 'TEMPLATE';
      template_name: string | null;
      text_body: string;
      due_at: string;
      created_at: string;
    }>(
      `SELECT bf.id, bf.contact_id, bf.conversation_id, ct.wa_id,
              ct.profile_name, ct.entity, bf.sequence, bf.delivery_mode,
              bf.template_name, bf.text_body, bf.due_at, bf.created_at
       FROM bot_followups bf
       JOIN contacts ct ON ct.id = bf.contact_id
       WHERE bf.status = 'PENDING' AND bf.due_at <= NOW()
       ORDER BY bf.due_at ASC, bf.id ASC
       FOR UPDATE OF bf SKIP LOCKED
       LIMIT $1`,
      [limit]
    );
    for (const row of result.rows) {
      await client.query(
        `UPDATE bot_followups
         SET status = 'PROCESSING', locked_at = NOW(),
             attempt_count = attempt_count + 1, updated_at = NOW()
         WHERE id = $1`,
        [row.id]
      );
    }
    await client.query('COMMIT');
    return result.rows.map((row) => ({
      id: row.id,
      contactId: row.contact_id,
      conversationId: row.conversation_id,
      waId: row.wa_id,
      profileName: row.profile_name,
      entity: row.entity,
      sequence: row.sequence,
      deliveryMode: row.delivery_mode,
      templateName: row.template_name,
      textBody: row.text_body,
      dueAt: row.due_at,
      createdAt: row.created_at
    }));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function followupEligibility(followup: DueFollowup): Promise<{
  eligible: boolean;
  reason: string | null;
}> {
  const result = await pool.query<{
    commercial_status: string;
    consent_status: string;
    opt_out_at: string | null;
    archived_at: string | null;
    bot_paused_until: string | null;
    newer_inbound: number | string;
    newer_outbound: number | string;
  }>(
    `SELECT ct.commercial_status, ct.consent_status, ct.opt_out_at,
            ct.archived_at, c.bot_paused_until,
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id
              AND m.direction = 'INBOUND' AND m.created_at > $2) AS newer_inbound,
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id
              AND m.direction = 'OUTBOUND' AND m.created_at > $2) AS newer_outbound
     FROM contacts ct JOIN conversations c ON c.contact_id = ct.id
     WHERE ct.id = $1`,
    [followup.contactId, followup.createdAt]
  );
  const row = result.rows[0];
  if (!row) return { eligible: false, reason: 'contact_missing' };
  if (row.archived_at) return { eligible: false, reason: 'contact_archived' };
  if (row.opt_out_at || row.consent_status === 'REVOKED') return { eligible: false, reason: 'opt_out' };
  if (['DO_NOT_CONTACT', 'FINALIZED', 'REJECTED'].includes(row.commercial_status)) {
    return { eligible: false, reason: `commercial_status_${row.commercial_status}` };
  }
  if (row.bot_paused_until && new Date(row.bot_paused_until).getTime() > Date.now()) {
    return { eligible: false, reason: 'bot_paused' };
  }
  if (Number(row.newer_inbound) > 0) return { eligible: false, reason: 'customer_replied' };
  if (Number(row.newer_outbound) > 0) return { eligible: false, reason: 'conversation_advanced' };
  return { eligible: true, reason: null };
}

export async function finishFollowup(params: {
  id: string;
  status: 'SENT' | 'SKIPPED' | 'FAILED' | 'PENDING';
  sentMessageId?: string | null;
  reason?: string | null;
  error?: string | null;
  dueAt?: Date | null;
}): Promise<void> {
  await pool.query(
    `UPDATE bot_followups SET status = $2,
       sent_message_id = COALESCE($3, sent_message_id), skip_reason = $4,
       error_message = $5, due_at = COALESCE($6, due_at),
       sent_at = CASE WHEN $2 = 'SENT' THEN NOW() ELSE sent_at END,
       locked_at = NULL, updated_at = NOW()
     WHERE id = $1`,
    [params.id, params.status, params.sentMessageId ?? null,
      params.reason ?? null, params.error ?? null, params.dueAt ?? null]
  );
}
