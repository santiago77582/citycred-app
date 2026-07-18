import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { AppError } from '../errors/AppError.js';
import { setConversationBotPause } from '../repository.js';
import { fetchAllMetaTemplates } from '../services/metaTemplates.js';
import {
  getWhatsappTemplateById,
  listWhatsappTemplates,
  syncWhatsappTemplates
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

templatesRouter.get('/:templateId', async (req, res) => {
  const { templateId } = idSchema.parse(req.params);
  res.json({ template: await getWhatsappTemplateById(templateId) });
});

templatesRouter.post('/:templateId/send', sendLimiter, async (req, res) => {
  const { templateId } = idSchema.parse(req.params);
  const input = sendSchema.parse(req.body);
  const template = await getWhatsappTemplateById(templateId);
  if (template.status !== 'APPROVED') {
    throw new AppError(`La plantilla no está aprobada. Estado: ${template.status}.`, 409);
  }
  if (!template.metaTemplateId || !template.lastSyncedAt) {
    throw new AppError('La plantilla todavía no fue confirmada mediante sincronización.', 409);
  }
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
