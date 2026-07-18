import { randomUUID } from 'node:crypto';
import { pool } from './db.js';
import { AppError } from './errors/AppError.js';

export type SyncedTemplate = {
  metaTemplateId: string;
  name: string;
  languageCode: string;
  category: string | null;
  status: string;
  components: unknown[];
  rejectionReason: string | null;
};

export type WhatsappTemplate = SyncedTemplate & {
  id: string;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type TemplateDbRow = {
  id: string;
  meta_template_id: string | null;
  name: string;
  language_code: string;
  category: string | null;
  status: string;
  components: unknown[];
  rejection_reason: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapTemplate(row: TemplateDbRow): WhatsappTemplate {
  return {
    id: row.id,
    metaTemplateId: row.meta_template_id ?? '',
    name: row.name,
    languageCode: row.language_code,
    category: row.category,
    status: row.status,
    components: Array.isArray(row.components) ? row.components : [],
    rejectionReason: row.rejection_reason,
    lastSyncedAt: row.last_synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function syncWhatsappTemplates(templates: SyncedTemplate[]): Promise<{
  synced: number;
  markedMissing: number;
  syncedAt: string;
}> {
  const client = await pool.connect();
  const syncedAt = new Date();
  try {
    await client.query('BEGIN');
    for (const template of templates) {
      await client.query(
        `INSERT INTO whatsapp_templates (
           id, meta_template_id, name, language_code, category, status,
           components, rejection_reason, last_synced_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
         ON CONFLICT (name, language_code) DO UPDATE SET
           meta_template_id = EXCLUDED.meta_template_id,
           category = EXCLUDED.category,
           status = EXCLUDED.status,
           components = EXCLUDED.components,
           rejection_reason = EXCLUDED.rejection_reason,
           last_synced_at = EXCLUDED.last_synced_at,
           updated_at = NOW()`,
        [
          randomUUID(),
          template.metaTemplateId,
          template.name,
          template.languageCode,
          template.category,
          template.status,
          JSON.stringify(template.components),
          template.rejectionReason,
          syncedAt
        ]
      );
    }

    const missing = await client.query(
      `UPDATE whatsapp_templates
       SET status = 'NOT_FOUND', updated_at = NOW()
       WHERE meta_template_id IS NOT NULL
         AND (last_synced_at IS NULL OR last_synced_at < $1)
         AND status <> 'LOCAL_DRAFT'`,
      [syncedAt]
    );
    await client.query('COMMIT');
    return {
      synced: templates.length,
      markedMissing: missing.rowCount ?? 0,
      syncedAt: syncedAt.toISOString()
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function listWhatsappTemplates(params: {
  limit: number;
  search?: string;
  status?: string;
  languageCode?: string;
}): Promise<WhatsappTemplate[]> {
  const values: unknown[] = [];
  const filters: string[] = [];
  if (params.search) {
    values.push(`%${params.search}%`);
    filters.push(`(name ILIKE $${values.length} OR COALESCE(category, '') ILIKE $${values.length})`);
  }
  if (params.status) {
    values.push(params.status);
    filters.push(`status = $${values.length}`);
  }
  if (params.languageCode) {
    values.push(params.languageCode);
    filters.push(`language_code = $${values.length}`);
  }
  values.push(params.limit);
  const result = await pool.query<TemplateDbRow>(
    `SELECT id, meta_template_id, name, language_code, category, status,
            components, rejection_reason, last_synced_at, created_at, updated_at
     FROM whatsapp_templates
     ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
     ORDER BY
       CASE status WHEN 'APPROVED' THEN 0 WHEN 'PENDING' THEN 1 ELSE 2 END,
       name ASC, language_code ASC
     LIMIT $${values.length}`,
    values
  );
  return result.rows.map(mapTemplate);
}

export async function getWhatsappTemplateById(id: string): Promise<WhatsappTemplate> {
  const result = await pool.query<TemplateDbRow>(
    `SELECT id, meta_template_id, name, language_code, category, status,
            components, rejection_reason, last_synced_at, created_at, updated_at
     FROM whatsapp_templates
     WHERE id = $1`,
    [id]
  );
  const row = result.rows[0];
  if (!row) throw new AppError('Plantilla no encontrada.', 404);
  return mapTemplate(row);
}
