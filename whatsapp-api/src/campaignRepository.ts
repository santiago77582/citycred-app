import { randomUUID } from 'node:crypto';
import { pool } from './db.js';
import { AppError } from './errors/AppError.js';
import { writeAuditEvent } from './repositories/auditRepository.js';

export const MAX_CAMPAIGN_PREVIEW_CONTACTS = 10_000;

export type CampaignAudienceFilter = {
  entities?: string[];
  commercialStatuses?: string[];
  labelIds?: string[];
  search?: string;
  updatedAfter?: string;
  updatedBefore?: string;
};

export type CampaignDraftInput = {
  name: string;
  templateId: string;
  audienceFilter: CampaignAudienceFilter;
  templateComponents?: unknown[];
};

type CampaignRow = {
  id: string;
  name: string;
  template_id: string;
  status: string;
  audience_filter: CampaignAudienceFilter;
  template_components: unknown[];
  preview_summary: Record<string, unknown>;
  last_previewed_at: string | null;
  scheduled_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  template_name: string;
  template_language_code: string;
  template_category: string | null;
  template_status: string;
  template_last_synced_at: string | null;
};

type CandidateRow = {
  id: string;
  wa_id: string;
  phone: string;
  profile_name: string | null;
  entity: string | null;
  commercial_status: string;
  consent_status: string;
  opt_out_at: string | null;
};

export type Campaign = {
  id: string;
  name: string;
  templateId: string;
  status: string;
  audienceFilter: CampaignAudienceFilter;
  templateComponents: unknown[];
  previewSummary: Record<string, unknown>;
  lastPreviewedAt: string | null;
  scheduledAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  template: {
    name: string;
    languageCode: string;
    category: string | null;
    status: string;
    lastSyncedAt: string | null;
  };
};

export type CampaignPreview = {
  campaignId: string;
  generatedAt: string;
  candidateCount: number;
  eligibleCount: number;
  excludedCount: number;
  exclusionReasons: Record<string, number>;
  eligibleSample: Array<{
    contactId: string;
    waId: string;
    name: string | null;
    entity: string | null;
  }>;
};

function mapCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    name: row.name,
    templateId: row.template_id,
    status: row.status,
    audienceFilter: row.audience_filter ?? {},
    templateComponents: Array.isArray(row.template_components) ? row.template_components : [],
    previewSummary: row.preview_summary ?? {},
    lastPreviewedAt: row.last_previewed_at,
    scheduledAt: row.scheduled_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    template: {
      name: row.template_name,
      languageCode: row.template_language_code,
      category: row.template_category,
      status: row.template_status,
      lastSyncedAt: row.template_last_synced_at
    }
  };
}

const campaignSelect = `
  SELECT c.id, c.name, c.template_id, c.status, c.audience_filter,
         c.template_components, c.preview_summary, c.last_previewed_at,
         c.scheduled_at, c.created_by, c.created_at, c.updated_at,
         t.name AS template_name, t.language_code AS template_language_code,
         t.category AS template_category, t.status AS template_status,
         t.last_synced_at AS template_last_synced_at
  FROM campaigns c
  JOIN whatsapp_templates t ON t.id = c.template_id
`;

function assertTemplateReady(templateStatus: string, lastSyncedAt: string | null): void {
  if (templateStatus !== 'APPROVED' || !lastSyncedAt) {
    throw new AppError(
      'La campaña necesita una plantilla aprobada y sincronizada con Meta.',
      409
    );
  }
}

function normalizeArray(values: string[] | undefined): string[] | undefined {
  if (!values?.length) return undefined;
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
}

function normalizeFilter(filter: CampaignAudienceFilter): CampaignAudienceFilter {
  return {
    entities: normalizeArray(filter.entities),
    commercialStatuses: normalizeArray(filter.commercialStatuses)?.map((value) => value.toUpperCase()),
    labelIds: normalizeArray(filter.labelIds),
    search: filter.search?.trim() || undefined,
    updatedAfter: filter.updatedAfter || undefined,
    updatedBefore: filter.updatedBefore || undefined
  };
}

function candidateWhere(filter: CampaignAudienceFilter): {
  sql: string;
  values: unknown[];
} {
  const values: unknown[] = [];
  const clauses = ['ct.archived_at IS NULL'];

  if (filter.entities?.length) {
    values.push(filter.entities);
    clauses.push(`ct.entity = ANY($${values.length}::text[])`);
  }
  if (filter.commercialStatuses?.length) {
    values.push(filter.commercialStatuses);
    clauses.push(`ct.commercial_status = ANY($${values.length}::text[])`);
  }
  if (filter.labelIds?.length) {
    values.push(filter.labelIds);
    clauses.push(`EXISTS (
      SELECT 1 FROM contact_labels cl
      WHERE cl.contact_id = ct.id AND cl.label_id = ANY($${values.length}::uuid[])
    )`);
  }
  if (filter.search) {
    values.push(`%${filter.search}%`);
    clauses.push(`(
      ct.wa_id ILIKE $${values.length}
      OR ct.phone ILIKE $${values.length}
      OR COALESCE(ct.profile_name, '') ILIKE $${values.length}
      OR COALESCE(ct.entity, '') ILIKE $${values.length}
      OR COALESCE(ct.document_number, '') ILIKE $${values.length}
    )`);
  }
  if (filter.updatedAfter) {
    values.push(filter.updatedAfter);
    clauses.push(`ct.updated_at >= $${values.length}::timestamptz`);
  }
  if (filter.updatedBefore) {
    values.push(filter.updatedBefore);
    clauses.push(`ct.updated_at < $${values.length}::timestamptz`);
  }

  return { sql: clauses.join(' AND '), values };
}

function exclusionReason(contact: CandidateRow): string | null {
  if (
    contact.commercial_status === 'DO_NOT_CONTACT'
    || contact.opt_out_at !== null
    || contact.consent_status === 'REVOKED'
  ) {
    return 'DO_NOT_CONTACT';
  }
  if (contact.consent_status !== 'GRANTED') return 'CONSENT_NOT_GRANTED';
  if (!/^\d{8,20}$/.test(contact.wa_id) || !/^\d{8,20}$/.test(contact.phone)) {
    return 'INVALID_PHONE';
  }
  return null;
}

export async function createCampaignDraft(
  input: CampaignDraftInput,
  actorUserId?: string | null
): Promise<Campaign> {
  const filter = normalizeFilter(input.audienceFilter);
  const templateResult = await pool.query<{
    status: string;
    last_synced_at: string | null;
  }>(
    `SELECT status, last_synced_at FROM whatsapp_templates WHERE id = $1`,
    [input.templateId]
  );
  const template = templateResult.rows[0];
  if (!template) throw new AppError('Plantilla no encontrada.', 404);
  assertTemplateReady(template.status, template.last_synced_at);

  const id = randomUUID();
  await pool.query(
    `INSERT INTO campaigns (
       id, name, template_id, status, audience_filter, template_components, created_by
     ) VALUES ($1, $2, $3, 'DRAFT', $4::jsonb, $5::jsonb, $6)`,
    [
      id,
      input.name.trim(),
      input.templateId,
      JSON.stringify(filter),
      JSON.stringify(input.templateComponents ?? []),
      actorUserId ?? null
    ]
  );
  const campaign = await getCampaignById(id);
  await writeAuditEvent({
    actorUserId,
    action: 'CAMPAIGN_DRAFT_CREATED',
    entityType: 'CAMPAIGN',
    entityId: id,
    afterData: campaign
  });
  return campaign;
}

export async function updateCampaignDraft(
  id: string,
  input: CampaignDraftInput,
  actorUserId?: string | null
): Promise<Campaign> {
  const before = await getCampaignById(id);
  if (!['DRAFT', 'PREVIEWED'].includes(before.status)) {
    throw new AppError('Solo se pueden modificar campañas en borrador o vista previa.', 409);
  }
  const templateResult = await pool.query<{
    status: string;
    last_synced_at: string | null;
  }>(
    `SELECT status, last_synced_at FROM whatsapp_templates WHERE id = $1`,
    [input.templateId]
  );
  const template = templateResult.rows[0];
  if (!template) throw new AppError('Plantilla no encontrada.', 404);
  assertTemplateReady(template.status, template.last_synced_at);
  const filter = normalizeFilter(input.audienceFilter);

  await pool.query(
    `UPDATE campaigns SET
       name = $2,
       template_id = $3,
       audience_filter = $4::jsonb,
       template_components = $5::jsonb,
       status = 'DRAFT',
       preview_summary = '{}'::jsonb,
       last_previewed_at = NULL,
       approved_by = NULL,
       approved_at = NULL,
       updated_at = NOW()
     WHERE id = $1`,
    [
      id,
      input.name.trim(),
      input.templateId,
      JSON.stringify(filter),
      JSON.stringify(input.templateComponents ?? [])
    ]
  );
  await pool.query(`DELETE FROM campaign_recipients WHERE campaign_id = $1`, [id]);
  const after = await getCampaignById(id);
  await writeAuditEvent({
    actorUserId,
    action: 'CAMPAIGN_DRAFT_UPDATED',
    entityType: 'CAMPAIGN',
    entityId: id,
    beforeData: before,
    afterData: after
  });
  return after;
}

export async function cancelCampaignDraft(
  id: string,
  actorUserId?: string | null
): Promise<Campaign> {
  const before = await getCampaignById(id);
  if (!['DRAFT', 'PREVIEWED'].includes(before.status)) {
    throw new AppError('La campaña ya no puede cancelarse desde borrador.', 409);
  }
  await pool.query(
    `UPDATE campaigns SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`,
    [id]
  );
  const after = await getCampaignById(id);
  await writeAuditEvent({
    actorUserId,
    action: 'CAMPAIGN_CANCELLED',
    entityType: 'CAMPAIGN',
    entityId: id,
    beforeData: before,
    afterData: after
  });
  return after;
}

export async function listCampaigns(limit: number): Promise<Campaign[]> {
  const result = await pool.query<CampaignRow>(
    `${campaignSelect}
     ORDER BY c.updated_at DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows.map(mapCampaign);
}

export async function getCampaignById(id: string): Promise<Campaign> {
  const result = await pool.query<CampaignRow>(
    `${campaignSelect} WHERE c.id = $1`,
    [id]
  );
  const row = result.rows[0];
  if (!row) throw new AppError('Campaña no encontrada.', 404);
  return mapCampaign(row);
}

export async function previewCampaign(
  id: string,
  actorUserId?: string | null
): Promise<CampaignPreview> {
  const campaign = await getCampaignById(id);
  if (!['DRAFT', 'PREVIEWED'].includes(campaign.status)) {
    throw new AppError('La campaña no está disponible para vista previa.', 409);
  }
  assertTemplateReady(campaign.template.status, campaign.template.lastSyncedAt);

  const where = candidateWhere(normalizeFilter(campaign.audienceFilter));
  const countResult = await pool.query<{ total: string | number }>(
    `SELECT COUNT(*) AS total FROM contacts ct WHERE ${where.sql}`,
    where.values
  );
  const candidateCount = Number(countResult.rows[0]?.total ?? 0);
  if (candidateCount > MAX_CAMPAIGN_PREVIEW_CONTACTS) {
    throw new AppError(
      `La segmentación incluye ${candidateCount} contactos. El máximo de vista previa es ${MAX_CAMPAIGN_PREVIEW_CONTACTS}.`,
      413
    );
  }

  const candidates = await pool.query<CandidateRow>(
    `SELECT ct.id, ct.wa_id, ct.phone, ct.profile_name, ct.entity,
            ct.commercial_status, ct.consent_status, ct.opt_out_at
     FROM contacts ct
     WHERE ${where.sql}
     ORDER BY ct.updated_at DESC, ct.id ASC`,
    where.values
  );

  const client = await pool.connect();
  const exclusionReasons: Record<string, number> = {};
  const eligibleSample: CampaignPreview['eligibleSample'] = [];
  let eligibleCount = 0;
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM campaign_recipients WHERE campaign_id = $1`, [id]);
    for (const contact of candidates.rows) {
      const reason = exclusionReason(contact);
      if (reason) {
        exclusionReasons[reason] = (exclusionReasons[reason] ?? 0) + 1;
      } else {
        eligibleCount += 1;
        if (eligibleSample.length < 20) {
          eligibleSample.push({
            contactId: contact.id,
            waId: contact.wa_id,
            name: contact.profile_name,
            entity: contact.entity
          });
        }
      }
      await client.query(
        `INSERT INTO campaign_recipients (
           id, campaign_id, contact_id, status, skip_reason
         ) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (campaign_id, contact_id) DO UPDATE SET
           status = EXCLUDED.status,
           skip_reason = EXCLUDED.skip_reason,
           message_id = NULL,
           error_message = NULL,
           updated_at = NOW()`,
        [randomUUID(), id, contact.id, reason ? 'SKIPPED' : 'READY', reason]
      );
    }

    const generatedAt = new Date().toISOString();
    const summary = {
      candidateCount,
      eligibleCount,
      excludedCount: candidateCount - eligibleCount,
      exclusionReasons,
      generatedAt
    };
    await client.query(
      `UPDATE campaigns SET
         status = 'PREVIEWED',
         preview_summary = $2::jsonb,
         last_previewed_at = $3,
         approved_by = NULL,
         approved_at = NULL,
         updated_at = NOW()
       WHERE id = $1`,
      [id, JSON.stringify(summary), generatedAt]
    );
    await client.query('COMMIT');

    const preview: CampaignPreview = {
      campaignId: id,
      generatedAt,
      candidateCount,
      eligibleCount,
      excludedCount: candidateCount - eligibleCount,
      exclusionReasons,
      eligibleSample
    };
    await writeAuditEvent({
      actorUserId,
      action: 'CAMPAIGN_PREVIEW_GENERATED',
      entityType: 'CAMPAIGN',
      entityId: id,
      afterData: preview
    });
    return preview;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function listCampaignRecipients(
  campaignId: string,
  status: 'READY' | 'SKIPPED' | undefined,
  limit: number
): Promise<Array<Record<string, unknown>>> {
  await getCampaignById(campaignId);
  const values: unknown[] = [campaignId];
  const statusClause = status
    ? (values.push(status), `AND cr.status = $${values.length}`)
    : '';
  values.push(limit);
  const result = await pool.query(
    `SELECT cr.id, cr.status, cr.skip_reason, cr.error_message,
            ct.id AS contact_id, ct.wa_id, ct.phone, ct.profile_name,
            ct.entity, ct.commercial_status, ct.consent_status
     FROM campaign_recipients cr
     JOIN contacts ct ON ct.id = cr.contact_id
     WHERE cr.campaign_id = $1 ${statusClause}
     ORDER BY cr.status ASC, ct.profile_name ASC NULLS LAST, ct.phone ASC
     LIMIT $${values.length}`,
    values
  );
  return result.rows;
}
