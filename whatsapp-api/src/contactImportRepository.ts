import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from './db.js';
import { AppError } from './errors/AppError.js';
import {
  parseContactImport,
  type ContactImportPayload
} from './contactImportParser.js';
import { writeAuditEvent } from './repositories/auditRepository.js';

type ImportBatchRow = {
  id: string;
  filename: string;
  source_format: 'CSV' | 'XLSX';
  status: 'PREVIEWED' | 'PROCESSING' | 'IMPORTED' | 'CANCELLED';
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  duplicate_rows: number;
  summary: Record<string, unknown>;
  created_by: string | null;
  imported_by: string | null;
  created_at: string;
  imported_at: string | null;
};

export type ContactImportBatch = {
  id: string;
  filename: string;
  sourceFormat: 'CSV' | 'XLSX';
  status: ImportBatchRow['status'];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  summary: Record<string, unknown>;
  createdBy: string | null;
  importedBy: string | null;
  createdAt: string;
  importedAt: string | null;
};

function mapBatch(row: ImportBatchRow): ContactImportBatch {
  return {
    id: row.id,
    filename: row.filename,
    sourceFormat: row.source_format,
    status: row.status,
    totalRows: Number(row.total_rows),
    validRows: Number(row.valid_rows),
    invalidRows: Number(row.invalid_rows),
    duplicateRows: Number(row.duplicate_rows),
    summary: row.summary ?? {},
    createdBy: row.created_by,
    importedBy: row.imported_by,
    createdAt: row.created_at,
    importedAt: row.imported_at
  };
}

export async function getContactImportBatch(batchId: string): Promise<ContactImportBatch> {
  const result = await pool.query<ImportBatchRow>(
    `SELECT * FROM contact_import_batches WHERE id = $1`,
    [batchId]
  );
  const row = result.rows[0];
  if (!row) throw new AppError('Importación no encontrada.', 404);
  return mapBatch(row);
}

export async function listContactImportRows(batchId: string, limit = 100) {
  await getContactImportBatch(batchId);
  const result = await pool.query(
    `SELECT row_number, normalized_phone, status, error_message, payload, contact_id
     FROM contact_import_rows
     WHERE batch_id = $1
     ORDER BY row_number ASC
     LIMIT $2`,
    [batchId, Math.max(1, Math.min(limit, 500))]
  );
  return result.rows;
}

export async function previewContactImport(params: {
  bytes: Buffer;
  filename: string;
  actorUserId: string;
}): Promise<{ batch: ContactImportBatch; rows: unknown[] }> {
  const parsed = await parseContactImport(params.bytes, params.filename);
  const batchId = randomUUID();
  const summary = {
    noContactsChanged: true,
    consentRule:
      'Solo se acepta GRANTED con fecha explícita; una celda vacía nunca otorga consentimiento.'
  };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO contact_import_batches (
         id, filename, source_format, status, total_rows, valid_rows,
         invalid_rows, duplicate_rows, summary, created_by
       ) VALUES ($1,$2,$3,'PREVIEWED',$4,$5,$6,$7,$8::jsonb,$9)`,
      [
        batchId,
        params.filename.trim(),
        parsed.format,
        parsed.totalRows,
        parsed.validRows,
        parsed.invalidRows,
        parsed.duplicateRows,
        JSON.stringify(summary),
        params.actorUserId
      ]
    );
    for (const row of parsed.rows) {
      await client.query(
        `INSERT INTO contact_import_rows (
           id, batch_id, row_number, normalized_phone, status, error_message, payload
         ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
        [
          randomUUID(), batchId, row.rowNumber, row.normalizedPhone,
          row.status, row.error, JSON.stringify(row.payload)
        ]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  const batch = await getContactImportBatch(batchId);
  await writeAuditEvent({
    actorUserId: params.actorUserId,
    action: 'CONTACT_IMPORT_PREVIEWED',
    entityType: 'CONTACT_IMPORT',
    entityId: batchId,
    afterData: {
      filename: batch.filename,
      sourceFormat: batch.sourceFormat,
      totalRows: batch.totalRows,
      validRows: batch.validRows,
      invalidRows: batch.invalidRows,
      duplicateRows: batch.duplicateRows
    }
  });
  return { batch, rows: await listContactImportRows(batchId, 100) };
}

type ExistingContact = {
  id: string;
  archived_at: string | null;
  commercial_status: string;
  consent_status: 'UNKNOWN' | 'GRANTED' | 'REVOKED';
  consent_at: string | null;
  consent_source: string | null;
  opt_out_at: string | null;
};

async function importContactRow(
  client: PoolClient,
  batchId: string,
  row: { id: string; payload: ContactImportPayload }
): Promise<'created' | 'updated' | 'skipped'> {
  const payload = row.payload;
  const existingResult = await client.query<ExistingContact>(
    `SELECT id, archived_at, commercial_status, consent_status,
            consent_at, consent_source, opt_out_at
     FROM contacts WHERE wa_id = $1`,
    [payload.phone]
  );
  const existing = existingResult.rows[0];
  if (existing?.archived_at) {
    await client.query(
      `UPDATE contact_import_rows SET
         status = 'INVALID', error_message = 'El contacto existente está archivado.', updated_at = NOW()
       WHERE id = $1`,
      [row.id]
    );
    return 'skipped';
  }

  const importedRevocation = payload.consentStatus === 'REVOKED'
    || payload.commercialStatus === 'DO_NOT_CONTACT';
  const protectedRevocation = Boolean(existing) && (
    existing?.consent_status === 'REVOKED'
    || existing?.commercial_status === 'DO_NOT_CONTACT'
    || existing?.opt_out_at !== null
  );
  const revoked = importedRevocation || protectedRevocation;
  const consentStatus = revoked
    ? 'REVOKED'
    : payload.consentStatus === 'UNKNOWN' && existing
      ? existing.consent_status
      : payload.consentStatus;
  const consentAt = consentStatus === 'GRANTED'
    ? (payload.consentAt ?? existing?.consent_at ?? null)
    : null;
  const consentSource = protectedRevocation && !importedRevocation
    ? existing?.consent_source ?? null
    : payload.consentStatus !== 'UNKNOWN' || importedRevocation
      ? `IMPORT:${batchId}`
      : existing?.consent_source ?? null;
  const optOutAt = revoked ? (existing?.opt_out_at ?? new Date()) : null;
  const commercialStatus = revoked ? 'DO_NOT_CONTACT' : payload.commercialStatus;

  let contactId: string;
  if (existing) {
    contactId = existing.id;
    await client.query(
      `UPDATE contacts SET
         phone = $2,
         profile_name = COALESCE($3, profile_name),
         entity = COALESCE($4, entity),
         document_number = COALESCE($5, document_number),
         seniority_range = COALESCE($6, seniority_range),
         available_quota = COALESCE($7, available_quota),
         commercial_status = $8,
         notes = COALESCE($9, notes),
         consent_status = $10,
         consent_at = $11,
         consent_source = $12,
         opt_out_at = $13,
         updated_at = NOW()
       WHERE id = $1`,
      [
        contactId, payload.phone, payload.profileName, payload.entity,
        payload.documentNumber, payload.seniorityRange, payload.availableQuota,
        commercialStatus, payload.notes, consentStatus, consentAt,
        consentSource, optOutAt
      ]
    );
  } else {
    contactId = randomUUID();
    await client.query(
      `INSERT INTO contacts (
         id, wa_id, phone, profile_name, entity, document_number,
         seniority_range, available_quota, commercial_status, notes,
         consent_status, consent_at, consent_source, opt_out_at
       ) VALUES ($1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        contactId, payload.phone, payload.profileName, payload.entity,
        payload.documentNumber, payload.seniorityRange, payload.availableQuota,
        commercialStatus, payload.notes, consentStatus, consentAt,
        consentSource, optOutAt
      ]
    );
  }
  await client.query(
    `UPDATE contact_import_rows SET
       status = 'IMPORTED', contact_id = $2, error_message = NULL, updated_at = NOW()
     WHERE id = $1`,
    [row.id, contactId]
  );
  return existing ? 'updated' : 'created';
}

export async function commitContactImport(
  batchId: string,
  actorUserId: string
): Promise<ContactImportBatch> {
  const before = await getContactImportBatch(batchId);
  if (before.status !== 'PREVIEWED') {
    throw new AppError('La importación ya fue procesada o cancelada.', 409);
  }
  if (before.validRows < 1) {
    throw new AppError('No hay filas válidas para importar.', 409);
  }

  const client = await pool.connect();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  try {
    await client.query('BEGIN');
    const claimed = await client.query(
      `UPDATE contact_import_batches SET status = 'PROCESSING'
       WHERE id = $1 AND status = 'PREVIEWED'
       RETURNING id`,
      [batchId]
    );
    if (claimed.rowCount !== 1) {
      throw new AppError('La importación ya está siendo procesada.', 409);
    }
    const rows = await client.query<{ id: string; payload: ContactImportPayload }>(
      `SELECT id, payload FROM contact_import_rows
       WHERE batch_id = $1 AND status = 'VALID'
       ORDER BY row_number ASC`,
      [batchId]
    );
    for (const row of rows.rows) {
      const result = await importContactRow(client, batchId, row);
      if (result === 'created') created += 1;
      else if (result === 'updated') updated += 1;
      else skipped += 1;
    }
    const summary = {
      ...before.summary,
      noContactsChanged: false,
      created,
      updated,
      skipped,
      importedAt: new Date().toISOString()
    };
    await client.query(
      `UPDATE contact_import_batches SET
         status = 'IMPORTED', imported_by = $2, imported_at = NOW(), summary = $3::jsonb
       WHERE id = $1 AND status = 'PROCESSING'`,
      [batchId, actorUserId, JSON.stringify(summary)]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  const after = await getContactImportBatch(batchId);
  await writeAuditEvent({
    actorUserId,
    action: 'CONTACT_IMPORT_COMMITTED',
    entityType: 'CONTACT_IMPORT',
    entityId: batchId,
    beforeData: before,
    afterData: { ...after, summary: { created, updated, skipped } }
  });
  return after;
}
