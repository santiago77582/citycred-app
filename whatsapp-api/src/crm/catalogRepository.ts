import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { AppError } from '../errors/AppError.js';
import { writeAuditEvent } from './auditRepository.js';
import { getCrmContactByWaId } from './contactRepository.js';

export async function listLabels() {
  const result = await pool.query(
    `SELECT id, name, description, color, active, created_at, updated_at
     FROM labels WHERE active = TRUE ORDER BY name ASC`
  );
  return result.rows;
}

export async function createLabel(params: {
  name: string;
  description?: string | null;
  color?: string | null;
  actorUserId?: string | null;
}) {
  const result = await pool.query(
    `INSERT INTO labels (id, name, description, color)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [randomUUID(), params.name, params.description ?? null, params.color ?? null]
  );
  const label = result.rows[0];
  await writeAuditEvent({
    actorUserId: params.actorUserId,
    action: 'LABEL_CREATED',
    entityType: 'LABEL',
    entityId: String(label.id),
    afterData: label
  });
  return label;
}

export async function setContactLabel(params: {
  waId: string;
  labelId: string;
  assigned: boolean;
  actorUserId?: string | null;
}) {
  const contact = await getCrmContactByWaId(params.waId);
  if (params.assigned) {
    const label = await pool.query(`SELECT id FROM labels WHERE id = $1 AND active = TRUE`, [params.labelId]);
    if (!label.rows[0]) throw new AppError('Etiqueta no encontrada.', 404);
    await pool.query(
      `INSERT INTO contact_labels (contact_id, label_id, assigned_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (contact_id, label_id) DO NOTHING`,
      [contact.id, params.labelId, params.actorUserId ?? null]
    );
  } else {
    await pool.query(
      `DELETE FROM contact_labels WHERE contact_id = $1 AND label_id = $2`,
      [contact.id, params.labelId]
    );
  }
  await writeAuditEvent({
    actorUserId: params.actorUserId,
    action: params.assigned ? 'CONTACT_LABEL_ADDED' : 'CONTACT_LABEL_REMOVED',
    entityType: 'CONTACT',
    entityId: String(contact.id),
    afterData: { labelId: params.labelId, assigned: params.assigned }
  });
}

export async function listContactLabels(waId: string) {
  const contact = await getCrmContactByWaId(waId);
  const result = await pool.query(
    `SELECT l.id, l.name, l.description, l.color
     FROM contact_labels cl
     JOIN labels l ON l.id = cl.label_id
     WHERE cl.contact_id = $1 AND l.active = TRUE
     ORDER BY l.name ASC`,
    [contact.id]
  );
  return result.rows;
}

export async function listQuickReplies() {
  const result = await pool.query(
    `SELECT id, shortcut, title, body, category, active, created_at, updated_at
     FROM quick_replies WHERE active = TRUE ORDER BY category NULLS LAST, title ASC`
  );
  return result.rows;
}

export async function createQuickReply(params: {
  shortcut: string;
  title: string;
  body: string;
  category?: string | null;
  actorUserId?: string | null;
}) {
  const result = await pool.query(
    `INSERT INTO quick_replies (id, shortcut, title, body, category, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      randomUUID(),
      params.shortcut,
      params.title,
      params.body,
      params.category ?? null,
      params.actorUserId ?? null
    ]
  );
  const reply = result.rows[0];
  await writeAuditEvent({
    actorUserId: params.actorUserId,
    action: 'QUICK_REPLY_CREATED',
    entityType: 'QUICK_REPLY',
    entityId: String(reply.id),
    afterData: reply
  });
  return reply;
}
