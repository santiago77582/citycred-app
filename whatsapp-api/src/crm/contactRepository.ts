import { pool } from '../db.js';
import { AppError } from '../errors/AppError.js';
import { writeAuditEvent } from './auditRepository.js';

export type CommercialStatus =
  | 'NEW' | 'PENDING' | 'INTERESTED' | 'DOCUMENTATION_PENDING'
  | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'FINALIZED' | 'DO_NOT_CONTACT';
export type ConsentStatus = 'UNKNOWN' | 'GRANTED' | 'REVOKED';

export type ContactPatch = {
  profileName?: string | null;
  entity?: string | null;
  documentNumber?: string | null;
  seniorityRange?: string | null;
  availableQuota?: number | null;
  commercialStatus?: CommercialStatus;
  notes?: string | null;
  consentStatus?: ConsentStatus;
};

export async function listCrmContacts(params: {
  limit: number;
  search?: string;
  status?: CommercialStatus;
  entity?: string;
}) {
  const values: unknown[] = [];
  const filters: string[] = ['ct.archived_at IS NULL'];
  if (params.search) {
    values.push(`%${params.search}%`);
    filters.push(`(ct.wa_id ILIKE $${values.length} OR ct.phone ILIKE $${values.length}
      OR COALESCE(ct.profile_name, '') ILIKE $${values.length}
      OR COALESCE(ct.document_number, '') ILIKE $${values.length})`);
  }
  if (params.status) {
    values.push(params.status);
    filters.push(`ct.commercial_status = $${values.length}`);
  }
  if (params.entity) {
    values.push(params.entity);
    filters.push(`ct.entity = $${values.length}`);
  }
  values.push(params.limit);
  const result = await pool.query(
    `SELECT ct.id, ct.wa_id, ct.phone, ct.profile_name, ct.entity,
            ct.document_number, ct.seniority_range, ct.available_quota,
            ct.commercial_status, ct.notes, ct.consent_status,
            ct.consent_at, ct.opt_out_at, ct.updated_at,
            c.id AS conversation_id, c.assigned_user_id,
            u.display_name AS assigned_user_name
     FROM contacts ct
     LEFT JOIN conversations c ON c.contact_id = ct.id
     LEFT JOIN app_users u ON u.id = c.assigned_user_id
     WHERE ${filters.join(' AND ')}
     ORDER BY ct.updated_at DESC
     LIMIT $${values.length}`,
    values
  );
  return result.rows;
}

export async function getCrmContactByWaId(waId: string) {
  const result = await pool.query(
    `SELECT ct.*, c.id AS conversation_id, c.assigned_user_id,
            u.display_name AS assigned_user_name
     FROM contacts ct
     LEFT JOIN conversations c ON c.contact_id = ct.id
     LEFT JOIN app_users u ON u.id = c.assigned_user_id
     WHERE ct.wa_id = $1 AND ct.archived_at IS NULL`,
    [waId]
  );
  const contact = result.rows[0];
  if (!contact) throw new AppError('Cliente no encontrado.', 404);
  return contact;
}

export async function updateCrmContact(
  waId: string,
  patch: ContactPatch,
  actorUserId?: string | null
) {
  const before = await getCrmContactByWaId(waId);
  const consentAt = patch.consentStatus === 'GRANTED' ? new Date() : null;
  const optOutAt = patch.commercialStatus === 'DO_NOT_CONTACT' || patch.consentStatus === 'REVOKED'
    ? new Date()
    : null;
  const result = await pool.query(
    `UPDATE contacts SET
       profile_name = CASE WHEN $2::boolean THEN $3 ELSE profile_name END,
       entity = CASE WHEN $4::boolean THEN $5 ELSE entity END,
       document_number = CASE WHEN $6::boolean THEN $7 ELSE document_number END,
       seniority_range = CASE WHEN $8::boolean THEN $9 ELSE seniority_range END,
       available_quota = CASE WHEN $10::boolean THEN $11 ELSE available_quota END,
       commercial_status = COALESCE($12, commercial_status),
       notes = CASE WHEN $13::boolean THEN $14 ELSE notes END,
       consent_status = COALESCE($15, consent_status),
       consent_at = COALESCE($16, consent_at),
       opt_out_at = COALESCE($17, opt_out_at),
       updated_at = NOW()
     WHERE wa_id = $1 AND archived_at IS NULL
     RETURNING *`,
    [
      waId,
      Object.hasOwn(patch, 'profileName'), patch.profileName ?? null,
      Object.hasOwn(patch, 'entity'), patch.entity ?? null,
      Object.hasOwn(patch, 'documentNumber'), patch.documentNumber ?? null,
      Object.hasOwn(patch, 'seniorityRange'), patch.seniorityRange ?? null,
      Object.hasOwn(patch, 'availableQuota'), patch.availableQuota ?? null,
      patch.commercialStatus ?? null,
      Object.hasOwn(patch, 'notes'), patch.notes ?? null,
      patch.consentStatus ?? null,
      consentAt,
      optOutAt
    ]
  );
  const after = result.rows[0];
  if (!after) throw new AppError('Cliente no encontrado.', 404);
  await writeAuditEvent({
    actorUserId,
    action: 'CONTACT_UPDATED',
    entityType: 'CONTACT',
    entityId: String(after.id),
    beforeData: before,
    afterData: after
  });
  return after;
}
