import { Readable, Transform } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';
import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../errors/AppError.js';
import {
  getAttachmentForDownload,
  listAttachmentsByWaId,
  updateAttachmentAvailability
} from '../mediaRepository.js';
import {
  MAX_MEDIA_DOWNLOAD_BYTES,
  openMetaMediaDownload
} from '../services/metaMedia.js';
import { normalizePhone } from '../utils/phone.js';

export const mediaRouter = Router();

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100)
});
const attachmentParamsSchema = z.object({ attachmentId: z.string().uuid() });

function safeFilename(value: string | null, mediaType: string): string {
  const cleaned = (value ?? '')
    .normalize('NFKC')
    .replace(/[\r\n]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
    .slice(0, 180);
  if (cleaned) return cleaned;
  const extensions: Record<string, string> = {
    IMAGE: 'jpg', AUDIO: 'mp3', VOICE: 'ogg', VIDEO: 'mp4',
    DOCUMENT: 'bin', STICKER: 'webp', OTHER: 'bin'
  };
  return `archivo.${extensions[mediaType] ?? 'bin'}`;
}

mediaRouter.get('/conversations/:waId/attachments', async (req, res) => {
  const waId = normalizePhone(String(req.params.waId));
  const { limit } = listQuerySchema.parse(req.query);
  const attachments = await listAttachmentsByWaId(waId, limit);
  res.json({ waId, attachments });
});

mediaRouter.get('/attachments/:attachmentId', async (req, res, next) => {
  const { attachmentId } = attachmentParamsSchema.parse(req.params);
  const attachment = await getAttachmentForDownload(attachmentId);
  const opened = await openMetaMediaDownload(attachment.mediaId);

  const contentType = opened.response.headers.get('content-type')
    ?? opened.info.mime_type
    ?? attachment.mimeType
    ?? 'application/octet-stream';
  const lengthHeader = opened.response.headers.get('content-length');
  const sizeBytes = lengthHeader
    ? Number(lengthHeader)
    : typeof opened.info.file_size === 'number'
      ? opened.info.file_size
      : null;
  const filename = safeFilename(attachment.filename, attachment.mediaType);

  await updateAttachmentAvailability({
    attachmentId,
    mimeType: contentType,
    sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
    status: 'AVAILABLE'
  });

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (Number.isFinite(sizeBytes)) res.setHeader('Content-Length', String(sizeBytes));

  let streamedBytes = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      streamedBytes += chunk.length;
      if (streamedBytes > MAX_MEDIA_DOWNLOAD_BYTES) {
        callback(new AppError('El archivo supera el tamaño máximo permitido.', 413));
        return;
      }
      callback(null, chunk);
    }
  });

  const source = Readable.fromWeb(
    opened.response.body as unknown as WebReadableStream<Uint8Array>
  );

  try {
    await pipeline(source, limiter, res);
  } catch (error) {
    if (!res.headersSent) {
      next(error);
      return;
    }
    res.destroy(error instanceof Error ? error : new Error(String(error)));
  }
});
