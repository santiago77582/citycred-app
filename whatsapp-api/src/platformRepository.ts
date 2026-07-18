import { randomUUID } from 'node:crypto';
import { pool } from './db.js';

export type AttachmentType = 'IMAGE' | 'AUDIO' | 'VOICE' | 'VIDEO' | 'DOCUMENT' | 'STICKER' | 'OTHER';

export async function registerInboundActivity(conversationId: string): Promise<void> {
  await pool.query(
    `UPDATE conversations
     SET unread_count = unread_count + 1,
         last_inbound_at = NOW(),
         last_message_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [conversationId]
  );
}

export async function insertMessageAttachment(params: {
  messageId: string;
  mediaId: string | null;
  mediaType: AttachmentType;
  mimeType: string | null;
  filename: string | null;
  caption: string | null;
}): Promise<string | null> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO message_attachments (
       id, message_id, media_id, media_type, mime_type, filename, caption
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (media_id) WHERE media_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      randomUUID(),
      params.messageId,
      params.mediaId,
      params.mediaType,
      params.mimeType,
      params.filename,
      params.caption
    ]
  );
  return result.rows[0]?.id ?? null;
}

export async function recordMessageMilestone(wamid: string, status: string): Promise<void> {
  await pool.query(
    `UPDATE messages
     SET sent_at = CASE
           WHEN $2 IN ('SENT','DELIVERED','READ') THEN COALESCE(sent_at, NOW())
           ELSE sent_at
         END,
         delivered_at = CASE
           WHEN $2 IN ('DELIVERED','READ') THEN COALESCE(delivered_at, NOW())
           ELSE delivered_at
         END,
         read_at = CASE
           WHEN $2 = 'READ' THEN COALESCE(read_at, NOW())
           ELSE read_at
         END,
         updated_at = NOW()
     WHERE wamid = $1 AND direction = 'OUTBOUND'`,
    [wamid, status]
  );
}
