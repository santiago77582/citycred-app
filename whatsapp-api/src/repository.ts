import { randomUUID } from 'node:crypto';
import { pool } from './db.js';
import { AppError } from './errors/AppError.js';

export type Status =
  | 'UNKNOWN'
  | 'PENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED'
  | 'RECEIVED';
export type Direction = 'INBOUND' | 'OUTBOUND';

const OUTBOUND_STATUS_RANK = {
  UNKNOWN: -1,
  PENDING: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
  FAILED: 99
} satisfies Record<Exclude<Status, 'RECEIVED'>, number>;

function outboundStatusRank(status: Status): number {
  if (status === 'RECEIVED') return -100;
  return OUTBOUND_STATUS_RANK[status];
}

/**
 * Regla de transición para mensajes salientes.
 *
 * - FAILED es terminal: ningún estado posterior puede revivir el mensaje.
 * - Cualquier estado puede pasar a FAILED si Meta informa un rechazo definitivo.
 * - El resto solo avanza de forma monotónica.
 */
export function canTransitionOutboundStatus(current: Status, next: Status): boolean {
  if (current === 'RECEIVED' || next === 'RECEIVED') return false;
  if (next === 'FAILED') return true;
  if (current === 'FAILED') return false;
  return outboundStatusRank(current) < outboundStatusRank(next);
}

function statusRankSql(expression: string): string {
  const cases = Object.entries(OUTBOUND_STATUS_RANK)
    .map(([status, rank]) => `WHEN '${status}' THEN ${rank}`)
    .join('\n               ');
  return `CASE ${expression}\n               ${cases}\n               ELSE -100\n             END`;
}

export type ContactRow = {
  id: string;
  wa_id: string;
  phone: string;
  profile_name: string | null;
};

export type ConversationRow = {
  id: string;
  contact_id: string;
};

export type ConversationSummary = {
  id: string;
  waId: string;
  phone: string;
  profileName: string | null;
  lastMessageAt: string;
  lastMessageText: string | null;
};

export type MessageSummary = {
  id: string;
  wamid: string | null;
  direction: Direction;
  type: string;
  text: string | null;
  status: Status;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
};

function firstRow<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) {
    throw new AppError('La base de datos no devolvió el registro esperado', 500);
  }
  return row;
}

export async function upsertContact(waId: string, profileName?: string | null): Promise<ContactRow> {
  const result = await pool.query<ContactRow>(
    `INSERT INTO contacts (id, wa_id, phone, profile_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (wa_id) DO UPDATE SET
       profile_name = COALESCE(EXCLUDED.profile_name, contacts.profile_name),
       updated_at = NOW()
     RETURNING id, wa_id, phone, profile_name`,
    [randomUUID(), waId, waId, profileName ?? null]
  );
  return firstRow(result.rows);
}

export async function upsertConversation(contactId: string): Promise<ConversationRow> {
  const result = await pool.query<ConversationRow>(
    `INSERT INTO conversations (id, contact_id)
     VALUES ($1, $2)
     ON CONFLICT (contact_id) DO UPDATE SET
       last_message_at = NOW(),
       updated_at = NOW()
     RETURNING id, contact_id`,
    [randomUUID(), contactId]
  );
  return firstRow(result.rows);
}

export async function insertMessage(params: {
  wamid: string | null;
  conversationId: string;
  direction: Direction;
  type: string;
  text: string | null;
  status: Status;
  raw: unknown;
  errorCode?: string | null;
  errorMessage?: string | null;
}): Promise<string | null> {
  const id = randomUUID();
  const result = await pool.query<{ id: string }>(
    `INSERT INTO messages (
       id, wamid, conversation_id, direction, type, text, status, error_code, error_message, raw
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
     ON CONFLICT (wamid) DO NOTHING
     RETURNING id`,
    [
      id,
      params.wamid,
      params.conversationId,
      params.direction,
      params.type,
      params.text,
      params.status,
      params.errorCode ?? null,
      params.errorMessage ?? null,
      JSON.stringify(params.raw ?? null)
    ]
  );
  return result.rows[0]?.id ?? null;
}

export async function updateMessageStatus(params: {
  wamid: string;
  status: Status;
  errorCode?: string | null;
  errorMessage?: string | null;
  raw?: unknown;
}): Promise<boolean> {
  const currentRankSql = statusRankSql('status');
  const nextRankSql = statusRankSql('$2');

  // Nunca se retrocede un estado. UNKNOWN puede avanzar si luego llega un webhook con wamid.
  // FAILED siempre gana al entrar y queda terminal una vez almacenado.
  const result = await pool.query(
    `UPDATE messages
     SET status = $2,
         error_code = COALESCE($3, error_code),
         error_message = COALESCE($4, error_message),
         raw = COALESCE($5::jsonb, raw),
         updated_at = NOW()
     WHERE wamid = $1
       AND direction = 'OUTBOUND'
       AND (
         $2 = 'FAILED'
         OR (
           status <> 'FAILED'
           AND ${currentRankSql} < ${nextRankSql}
         )
       )
     RETURNING id`,
    [
      params.wamid,
      params.status,
      params.errorCode ?? null,
      params.errorMessage ?? null,
      params.raw === undefined ? null : JSON.stringify(params.raw)
    ]
  );
  return result.rowCount === 1;
}

export async function createWebhookEvent(payload: unknown): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO webhook_events (id, payload)
     VALUES ($1, $2::jsonb)
     RETURNING id`,
    [randomUUID(), JSON.stringify(payload ?? null)]
  );
  return firstRow(result.rows).id;
}

export async function finishWebhookEvent(eventId: string, error?: string): Promise<void> {
  await pool.query(
    `UPDATE webhook_events
     SET processed_at = NOW(), error = $2
     WHERE id = $1`,
    [eventId, error ?? null]
  );
}

export async function listConversations(limit: number): Promise<ConversationSummary[]> {
  const result = await pool.query<{
    id: string;
    wa_id: string;
    phone: string;
    profile_name: string | null;
    last_message_at: string;
    last_message_text: string | null;
  }>(
    `SELECT c.id,
            ct.wa_id,
            ct.phone,
            ct.profile_name,
            c.last_message_at,
            (
              SELECT m.text FROM messages m
              WHERE m.conversation_id = c.id
              ORDER BY m.created_at DESC
              LIMIT 1
            ) AS last_message_text
     FROM conversations c
     JOIN contacts ct ON ct.id = c.contact_id
     ORDER BY c.last_message_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows.map((row) => ({
    id: row.id,
    waId: row.wa_id,
    phone: row.phone,
    profileName: row.profile_name,
    lastMessageAt: row.last_message_at,
    lastMessageText: row.last_message_text
  }));
}

export async function listMessagesByWaId(waId: string, limit: number): Promise<MessageSummary[]> {
  const result = await pool.query<{
    id: string;
    wamid: string | null;
    direction: Direction;
    type: string;
    text: string | null;
    status: Status;
    error_code: string | null;
    error_message: string | null;
    created_at: string;
  }>(
    `SELECT m.id, m.wamid, m.direction, m.type, m.text, m.status,
            m.error_code, m.error_message, m.created_at
     FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     JOIN contacts ct ON ct.id = c.contact_id
     WHERE ct.wa_id = $1
     ORDER BY m.created_at DESC
     LIMIT $2`,
    [waId, limit]
  );
  return result.rows.map((row) => ({
    id: row.id,
    wamid: row.wamid,
    direction: row.direction,
    type: row.type,
    text: row.text,
    status: row.status,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at
  }));
}
