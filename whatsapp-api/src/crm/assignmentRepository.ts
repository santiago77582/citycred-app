import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { AppError } from '../errors/AppError.js';
import { writeAuditEvent } from './auditRepository.js';
import { getCrmContactByWaId } from './contactRepository.js';

export async function assignConversation(params: {
  waId: string;
  userId: string | null;
  actorUserId?: string | null;
  source?: 'MANUAL' | 'AUTOMATIC' | 'TRANSFER';
}) {
  const contact = await getCrmContactByWaId(params.waId);
  const conversationId = contact.conversation_id as string | undefined;
  if (!conversationId) throw new AppError('El cliente todavía no tiene conversación.', 409);

  if (params.userId) {
    const user = await pool.query(
      `SELECT id FROM app_users WHERE id = $1 AND active = TRUE`,
      [params.userId]
    );
    if (!user.rows[0]) throw new AppError('Asesor no encontrado o inactivo.', 404);
  }

  await pool.query(
    `UPDATE conversation_assignments
     SET ended_at = NOW()
     WHERE conversation_id = $1 AND ended_at IS NULL`,
    [conversationId]
  );

  if (params.userId) {
    await pool.query(
      `INSERT INTO conversation_assignments (
         id, conversation_id, user_id, assigned_by, source
       ) VALUES ($1, $2, $3, $4, $5)`,
      [
        randomUUID(),
        conversationId,
        params.userId,
        params.actorUserId ?? null,
        params.source ?? 'MANUAL'
      ]
    );
  }

  const result = await pool.query(
    `UPDATE conversations SET
       assigned_user_id = $2,
       assignment_source = $3,
       assigned_at = CASE WHEN $2 IS NULL THEN NULL ELSE NOW() END,
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [conversationId, params.userId, params.source ?? 'MANUAL']
  );

  await writeAuditEvent({
    actorUserId: params.actorUserId,
    action: params.userId ? 'CONVERSATION_ASSIGNED' : 'CONVERSATION_UNASSIGNED',
    entityType: 'CONVERSATION',
    entityId: conversationId,
    beforeData: { assignedUserId: contact.assigned_user_id ?? null },
    afterData: { assignedUserId: params.userId }
  });
  return result.rows[0];
}
