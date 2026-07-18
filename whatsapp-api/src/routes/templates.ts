import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { AppError } from '../errors/AppError.js';
import { setConversationBotPause } from '../repository.js';
import {
  resolveOutboundMediaSpec,
  uploadMetaMedia,
  type OutboundMediaKind
} from '../services/metaMedia.js';
import { fetchAllMetaTemplates } from '../services/metaTemplates.js';
import {
  removePrivateTempUpload,
  savePrivateTempUpload
} from '../services/tempUpload.js';
import {
  getWhatsappTemplateById,
  listWhatsappTemplates,
  syncWhatsappTemplates,
  type WhatsappTemplate
} from '../templateRepository.js';
import { sendTemplateAndPersist } from './messages.js';

export const templatesRouter = Router();

const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  search: z.string().trim().max(200).optional(),
  status: z.string().trim().max(50).optional(),
  languageCode: z.string().trim().max(35).optional()
});
const idSchema = z.object({ templateId: z.string().uuid() });
const sendSchema = z.object({
  to: z.string().min(1).max(40),
  components: z.array(z.unknown()).max(20).optional()
});

const syncLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Esperá un minuto antes de sincronizar otra vez.' }
});
const sendLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Esperá un minuto antes de continuar con los envíos.' }
});
const headerUploadLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Esperá un minuto antes de cargar otro encabezado.' }
});

function requireApprovedSyncedTemplate(template: WhatsappTemplate): void {
  if (template.status !== 'APPROVED') {
    throw new AppError(`La plantilla no está aprobada. Estado: ${template.status}.`, 409);
  }
  if (!template.metaTemplateId || !template.lastSyncedAt) {
    throw new AppError('La plantilla todavía no fue confirmada mediante sincronización.', 409);
  }
}

function templateHeaderFormat(template: WhatsappTemplate): string | null {
  const header = template.components.find((component) => {
    if (!component || typeof component !== 'object') return false;
    return String((component as { type?: unknown }).type ?? '').toUpperCase() === 'HEADER';
  });
  if (!header || typeof header !== 'object') return null;
  const format = (header as { format?: unknown }).format;
  return typeof format === 'string' && format.trim() ? format.trim().toUpperCase() : 'TEXT';
}

function decodeFilename(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  if (value.length > 720) throw new AppError('El nombre del archivo es demasiado largo.', 400);
  try {
    const decoded = decodeURIComponent(value)
      .normalize('NFKC')
      .replace(/[\r\n\0]/g, '')
      .replace(/[\\/:*?"<>|]/g, '_')
      .trim()
      .slice(0, 180);
    return decoded || fallback;
  } catch {
    throw new AppError('El nombre del archivo no tiene un formato válido.', 400);
  }
}

function expectedKind(format: string): OutboundMediaKind {
  if (format === 'IMAGE') return 'image';
  if (format === 'VIDEO') return 'video';
  if (format === 'DOCUMENT') return 'document';
  throw new AppError('La plantilla no requiere un encabezado multimedia.', 409);
}

function fallbackFilename(kind: OutboundMediaKind): string {
  if (kind === 'image') return 'encabezado.jpg';
  if (kind === 'video') return 'encabezado.mp4';
  return 'encabezado.pdf';
}

templatesRouter.get('/', async (req, res) => {
  const query = listSchema.parse(req.query);
  const templates = await listWhatsappTemplates({
    limit: query.limit,
    search: query.search || undefined,
    status: query.status?.toUpperCase() || undefined,
    languageCode: query.languageCode || undefined
  });
  res.json({ templates });
});

templatesRouter.post('/sync', syncLimiter, async (_req, res) => {
  const templates = await fetchAllMetaTemplates();
  const result = await syncWhatsappTemplates(templates);
  res.json({ ...result, templates });
});

templatesRouter.post('/:templateId/header-media', headerUploadLimiter, async (req, res) => {
  const { templateId } = idSchema.parse(req.params);
  const template = await getWhatsappTemplateById(templateId);
  requireApprovedSyncedTemplate(template);
  const format = templateHeaderFormat(template);
  const requiredKind = expectedKind(format ?? 'TEXT');
  const spec = resolveOutboundMediaSpec(req.header('content-type') ?? '');
  if (spec.kind !== requiredKind) {
    throw new AppError(
      `La plantilla requiere un encabezado ${format?.toLowerCase()}, no ${spec.kind}.`,
      415
    );
  }

  const declaredLength = Number(req.header('content-length'));
  if (Number.isFinite(declaredLength)) {
    if (declaredLength <= 0) throw new AppError('El archivo está vacío.', 400);
    if (declaredLength > spec.maxBytes) {
      throw new AppError('El archivo supera el tamaño máximo permitido.', 413);
    }
  }

  const filename = decodeFilename(
    req.header('x-citycred-filename'),
    fallbackFilename(requiredKind)
  );
  let tempPath: string | null = null;
  try {
    const upload = await savePrivateTempUpload(req, spec.maxBytes);
    tempPath = upload.path;
    const media = await uploadMetaMedia({
      filePath: upload.path,
      mimeType: spec.mimeType,
      filename
    });
    res.status(201).json({
      templateId: template.id,
      mediaId: media.id,
      kind: requiredKind,
      format,
      filename,
      mimeType: spec.mimeType,
      sizeBytes: upload.sizeBytes
    });
  } finally {
    if (tempPath) await removePrivateTempUpload(tempPath);
  }
});

templatesRouter.get('/:templateId', async (req, res) => {
  const { templateId } = idSchema.parse(req.params);
  res.json({ template: await getWhatsappTemplateById(templateId) });
});

templatesRouter.post('/:templateId/send', sendLimiter, async (req, res) => {
  const { templateId } = idSchema.parse(req.params);
  const input = sendSchema.parse(req.body);
  const template = await getWhatsappTemplateById(templateId);
  requireApprovedSyncedTemplate(template);
  const outcome = await sendTemplateAndPersist({
    to: input.to,
    templateName: template.name,
    languageCode: template.languageCode,
    components: input.components
  });
  const botPausedUntil = await setConversationBotPause(
    outcome.payload.to,
    new Date(Date.now() + 5 * 60_000)
  );
  res.status(outcome.statusCode).json({
    ...outcome.payload,
    templateId: template.id,
    category: template.category,
    botPausedUntil
  });
});
