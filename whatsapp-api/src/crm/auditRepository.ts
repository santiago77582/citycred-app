import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';

export async function writeAuditEvent(params: {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
}): Promise<void> {
  await pool.query(
    `INSERT INTO audit_events (
       id, actor_user_id, action, entity_type, entity_id, before_data, after_data
     ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
    [
      randomUUID(),
      params.actorUserId ?? null,
      params.action,
      params.entityType,
      params.entityId ?? null,
      params.beforeData === undefined ? null : JSON.stringify(params.beforeData),
      params.afterData === undefined ? null : JSON.stringify(params.afterData)
    ]
  );
}
