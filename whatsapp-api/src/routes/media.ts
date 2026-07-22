import { Readable, Transform } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { AppError } from '../errors/AppError.js';
import {
  getAttachmentForDownload,
  listAttachmentsByWaId,
  updateAttachmentAvailability
} from '../mediaRepository.js';
import { setConversationBotPause } from '../repository.js';
import {
  MAX_MEDIA_DOWNLOAD_BYTES,
  openMetaMediaDownload,
  resolveOutboundMediaSpec,
  type OutboundMediaKind
} from '../services/metaMedia.js';
import { sendMediaFileAndPersist } from '../services/outboundMedia.js';
import {
  removePrivateTempUpload,
  savePrivateTempUpload
} from '../services/tempUpload.js';
import { normalizePhone } from '../utils/phone.js';
import { humanReplyPauseUntil } from '../bot/humanPause.js';

export const mediaRouter = Router();

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100)
});
const attachmentParamsSchema = z.object({ attachmentId: z.string().uuid() });

const uploadLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiadas cargas de archivos. Esperá un minuto y probá nuevamente.' }
});

function safeFilename(value: string | null, mediaType: string): string {
  const cleaned = (value ?? '')
    .normalize('NFKC')
    .replace(/[\r\n\0]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
    .slice(0, 180);
  if (cleaned) return cleaned;
  const extensions: Record<string, string> = {
    IMAGE: 'jpg', AUDIO: 'mp3', VOICE: 'ogg', VIDEO: 'mp4',
    DOCUMENT: 'bin', STICKER: 'webp', OTHER: 'bin',
    image: 'jpg', audio: 'mp3', video: 'mp4', document: 'bin', sticker: 'webp'
  };
  return `archivo.${extensions[mediaType] ?? 'bin'}`;
}

function decodeMetadataHeader(
  rawValue: string | undefined,
  maxLength: number,
  fieldName: string
): string | null {
  if (!rawValue) return null;
  if (rawValue.length > maxLength * 4) {
    throw new AppError(`${fieldName} es demasiado largo.`, 400);
  }
  try {
    const decoded = decodeURIComponent(rawValue)
      .normalize('NFKC')
      .replace(/[\r\n\0]/g, '')
      .trim();
    if (decoded.length > maxLength) {
      throw new AppError(`${fieldName} es demasiado largo.`, 400);
    }
    return decoded || null;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(`${fieldName} no tiene un formato válido.`, 400);
  }
}

function defaultFilename(kind: OutboundMediaKind): string {
  return safeFilename(null, kind);
}

mediaRouter.post('/outbound/:waId', uploadLimiter, async (req, res) => {
  const waId = normalizePhone(String(req.params.waId));
  const contentType = req.header('content-type') ?? '';
  const spec = resolveOutboundMediaSpec(contentType);
  const declaredLength = Number(req.header('content-length'));
  if (Number.isFinite(declaredLength)) {
    if (declaredLength <= 0) throw new AppError('El archivo está vacío.', 400);
    if (declaredLength > spec.maxBytes) {
      throw new AppError('El archivo supera el tamaño máximo permitido.', 413);
    }
  }

  const rawFilename = decodeMetadataHeader(
    req.header('x-citycred-filename'),
    180,
    'El nombre del archivo'
  );
  const rawCaption = decodeMetadataHeader(
    req.header('x-citycred-caption'),
    1024,
    'El texto del archivo'
  );
  const filename = safeFilename(rawFilename, spec.kind) || defaultFilename(spec.kind);
  let tempPath: string | null = null;

  try {
    const upload = await savePrivateTempUpload(req, spec.maxBytes);
    tempPath = upload.path;
    const outcome = await sendMediaFileAndPersist({
      to: waId,
      filePath: upload.path,
      filename,
      caption: rawCaption,
      sizeBytes: upload.sizeBytes,
      spec
    });
    const botPausedUntil = await setConversationBotPause(
      waId,
      humanReplyPauseUntil()
    );
    res.status(outcome.statusCode).json({ ...outcome.payload, botPausedUntil });
  } finally {
    if (tempPath) await removePrivateTempUpload(tempPath);
  }
});

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
