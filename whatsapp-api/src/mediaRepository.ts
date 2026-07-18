import { pool } from './db.js';
import { AppError } from './errors/AppError.js';

export type AttachmentSummary = {
  id: string;
  messageId: string;
  mediaId: string | null;
  mediaType: string;
  mimeType: string | null;
  filename: string | null;
  caption: string | null;
  sizeBytes: number | null;
  downloadStatus: string;
  createdAt: string;
};

export async function listAttachmentsByWaId(
  waId: string,
  limit: number
): Promise<AttachmentSummary[]> {
  const result = await pool.query<{
    id: string;
    message_id: string;
    media_id: string | null;
    media_type: string;
    mime_type: string | null;
    filename: string | null;
    caption: string | null;
    size_bytes: string | number | null;
    download_status: string;
    created_at: string;
  }>(
    `SELECT a.id, a.message_id, a.media_id, a.media_type, a.mime_type,
            a.filename, a.caption, a.size_bytes, a.download_status, a.created_at
     FROM message_attachments a
     JOIN messages m ON m.id = a.message_id
     JOIN conversations c ON c.id = m.conversation_id
     JOIN contacts ct ON ct.id = c.contact_id
     WHERE ct.wa_id = $1 AND a.download_status <> 'DELETED'
     ORDER BY a.created_at DESC
     LIMIT $2`,
    [waId, limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    messageId: row.message_id,
    mediaId: row.media_id,
    mediaType: row.media_type,
    mimeType: row.mime_type,
    filename: row.filename,
    caption: row.caption,
    sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
    downloadStatus: row.download_status,
    createdAt: row.created_at
  }));
}

export async function getAttachmentForDownload(attachmentId: string): Promise<{
  id: string;
  mediaId: string;
  mediaType: string;
  mimeType: string | null;
  filename: string | null;
  caption: string | null;
}> {
  const result = await pool.query<{
    id: string;
    media_id: string | null;
    media_type: string;
    mime_type: string | null;
    filename: string | null;
    caption: string | null;
    download_status: string;
  }>(
    `SELECT id, media_id, media_type, mime_type, filename, caption, download_status
     FROM message_attachments
     WHERE id = $1`,
    [attachmentId]
  );
  const attachment = result.rows[0];
  if (!attachment) throw new AppError('Archivo no encontrado.', 404);
  if (!attachment.media_id || attachment.download_status === 'DELETED') {
    throw new AppError('El archivo ya no está disponible para descargar.', 410);
  }
  return {
    id: attachment.id,
    mediaId: attachment.media_id,
    mediaType: attachment.media_type,
    mimeType: attachment.mime_type,
    filename: attachment.filename,
    caption: attachment.caption
  };
}

export async function updateAttachmentAvailability(params: {
  attachmentId: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  status: 'AVAILABLE' | 'FAILED' | 'EXPIRED';
}): Promise<void> {
  await pool.query(
    `UPDATE message_attachments SET
       mime_type = COALESCE($2, mime_type),
       size_bytes = COALESCE($3, size_bytes),
       download_status = $4,
       updated_at = NOW()
     WHERE id = $1`,
    [params.attachmentId, params.mimeType ?? null, params.sizeBytes ?? null, params.status]
  );
}
