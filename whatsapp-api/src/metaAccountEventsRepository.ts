import { createHash, randomUUID } from 'node:crypto';
import { pool } from './db.js';

const ACCOUNT_FIELDS = new Set([
  'phone_number_name_update',
  'phone_number_quality_update',
  'account_update',
  'account_review_update',
  'message_template_status_update'
]);

export type MetaAccountEvent = {
  id: string;
  wabaId: string | null;
  field: string;
  event: string | null;
  displayPhoneNumber: string | null;
  currentLimit: string | null;
  decision: string | null;
  requestedVerifiedName: string | null;
  rejectionReason: string | null;
  payload: Record<string, unknown>;
  occurredAt: string | null;
  receivedAt: string;
};

type EventRow = {
  id: string;
  waba_id: string | null;
  field: string;
  event: string | null;
  display_phone_number: string | null;
  current_limit: string | null;
  decision: string | null;
  requested_verified_name: string | null;
  rejection_reason: string | null;
  payload: Record<string, unknown>;
  occurred_at: string | null;
  received_at: string;
};

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function mapEvent(row: EventRow): MetaAccountEvent {
  return {
    id: row.id,
    wabaId: row.waba_id,
    field: row.field,
    event: row.event,
    displayPhoneNumber: row.display_phone_number,
    currentLimit: row.current_limit,
    decision: row.decision,
    requestedVerifiedName: row.requested_verified_name,
    rejectionReason: row.rejection_reason,
    payload: row.payload ?? {},
    occurredAt: row.occurred_at,
    receivedAt: row.received_at
  };
}

async function updateTemplateFromEvent(value: Record<string, unknown>): Promise<void> {
  const status = stringValue(value.event);
  if (!status) return;
  const templateId = stringValue(value.message_template_id);
  const name = stringValue(value.message_template_name);
  const language = stringValue(value.message_template_language);
  const rejectionReason = stringValue(value.rejection_reason);

  if (templateId) {
    await pool.query(
      `UPDATE whatsapp_templates
       SET status = $2,
           rejection_reason = COALESCE($3, rejection_reason),
           updated_at = NOW()
       WHERE meta_template_id = $1`,
      [templateId, status, rejectionReason]
    );
    return;
  }
  if (name && language) {
    await pool.query(
      `UPDATE whatsapp_templates
       SET status = $3,
           rejection_reason = COALESCE($4, rejection_reason),
           updated_at = NOW()
       WHERE name = $1 AND language_code = $2`,
      [name, language, status, rejectionReason]
    );
  }
}

export async function recordMetaAccountChanges(
  payload: Record<string, unknown>
): Promise<number> {
  const entries = Array.isArray(payload.entry)
    ? payload.entry as Array<Record<string, unknown>>
    : [];
  let inserted = 0;

  for (const entry of entries) {
    const wabaId = stringValue(entry.id);
    const entryTime = typeof entry.time === 'number'
      ? new Date(entry.time * 1000).toISOString()
      : null;
    const changes = Array.isArray(entry.changes)
      ? entry.changes as Array<Record<string, unknown>>
      : [];

    for (const change of changes) {
      const field = stringValue(change.field);
      if (!field || !ACCOUNT_FIELDS.has(field)) continue;
      const value = change.value && typeof change.value === 'object'
        ? change.value as Record<string, unknown>
        : {};
      const key = fingerprint({ wabaId, entryTime, field, value });
      const result = await pool.query(
        `INSERT INTO meta_account_events (
           id, fingerprint, waba_id, field, event, display_phone_number,
           current_limit, decision, requested_verified_name, rejection_reason,
           payload, occurred_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12
         )
         ON CONFLICT (fingerprint) DO NOTHING
         RETURNING id`,
        [
          randomUUID(),
          key,
          wabaId,
          field,
          stringValue(value.event),
          stringValue(value.display_phone_number),
          stringValue(value.current_limit),
          stringValue(value.decision),
          stringValue(value.requested_verified_name),
          stringValue(value.rejection_reason),
          JSON.stringify(value),
          entryTime
        ]
      );
      if (result.rowCount === 1) {
        inserted += 1;
        if (field === 'message_template_status_update') {
          await updateTemplateFromEvent(value);
        }
      }
    }
  }
  return inserted;
}

export async function listMetaAccountEvents(params: {
  limit: number;
  field?: string;
}): Promise<MetaAccountEvent[]> {
  const values: unknown[] = [];
  let where = '';
  if (params.field) {
    values.push(params.field);
    where = `WHERE field = $${values.length}`;
  }
  values.push(params.limit);
  const result = await pool.query<EventRow>(
    `SELECT id, waba_id, field, event, display_phone_number, current_limit,
            decision, requested_verified_name, rejection_reason, payload,
            occurred_at, received_at
     FROM meta_account_events
     ${where}
     ORDER BY COALESCE(occurred_at, received_at) DESC, received_at DESC
     LIMIT $${values.length}`,
    values
  );
  return result.rows.map(mapEvent);
}

export async function getLatestMetaAccountState(): Promise<{
  quality: MetaAccountEvent | null;
  name: MetaAccountEvent | null;
  account: MetaAccountEvent | null;
  review: MetaAccountEvent | null;
}> {
  const events = await listMetaAccountEvents({ limit: 500 });
  const latest = (field: string) => events.find((event) => event.field === field) ?? null;
  return {
    quality: latest('phone_number_quality_update'),
    name: latest('phone_number_name_update'),
    account: latest('account_update'),
    review: latest('account_review_update')
  };
}
