import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { getBotRuntimeSettings, getBotStateByWaId, updateBotRuntimeSettings } from '../bot/botStateRepository.js';
import { decideCitycredBot } from '../bot/citycredBotEngineV2.js';
import { listBotFollowups } from '../bot/followupRepository.js';
import { listBotInboundJobs } from '../bot/inboundJobRepository.js';
import { analizarBlindaje } from '../domain/blindaje.js';
import { normalizePhone } from '../utils/phone.js';

export const botRouter = Router();

botRouter.use(rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiadas operaciones del bot. Esperá un minuto.' }
}));

const settingsSchema = z.object({
  confirm: z.literal(true),
  botEnabled: z.boolean().optional(),
  followupsEnabled: z.boolean().optional(),
  businessHourStart: z.number().int().min(0).max(23).optional(),
  businessHourEnd: z.number().int().min(1).max(24).optional()
});

botRouter.get('/status', async (_req, res) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.json({ settings: await getBotRuntimeSettings() });
});

botRouter.patch('/settings', async (req, res) => {
  const parsed = settingsSchema.parse(req.body);
  if (
    parsed.businessHourStart !== undefined
    && parsed.businessHourEnd !== undefined
    && parsed.businessHourStart >= parsed.businessHourEnd
  ) {
    res.status(400).json({ error: 'La hora final debe ser posterior a la inicial.' });
    return;
  }
  const { confirm: _confirm, ...changes } = parsed;
  res.json({
    settings: await updateBotRuntimeSettings({
      ...changes,
      actorUserId: req.adminUser?.userId ?? null
    })
  });
});

botRouter.post('/preview', async (req, res) => {
  const input = z.object({
    waId: z.string().min(1),
    text: z.string().max(10000).nullable().default(null),
    interactiveId: z.string().max(300).nullable().optional(),
    messageType: z.string().max(100).nullable().optional(),
    hasMedia: z.boolean().default(false)
  }).parse(req.body);
  const current = await getBotStateByWaId(normalizePhone(input.waId));
  res.json({
    state: current.state,
    decision: decideCitycredBot(current.state, input),
    sent: false
  });
});

/**
 * Blindaje: revisa un texto antes de mandarlo y devuelve su riesgo para la
 * cuenta. Es de solo lectura, no envía ni guarda nada.
 */
botRouter.post('/blindaje', (req, res) => {
  const input = z.object({ text: z.string().max(10000) }).parse(req.body);
  res.json({ blindaje: analizarBlindaje(input.text) });
});

botRouter.get('/followups', async (req, res) => {
  const query = z.object({
    limit: z.coerce.number().int().min(1).max(500).default(100),
    status: z.enum(['PENDING','PROCESSING','SENT','SKIPPED','CANCELLED','FAILED']).optional(),
    waId: z.string().optional()
  }).parse(req.query);
  res.json({
    followups: await listBotFollowups({
      limit: query.limit,
      status: query.status,
      waId: query.waId ? normalizePhone(query.waId) : undefined
    })
  });
});

botRouter.get('/jobs', async (req, res) => {
  const query = z.object({
    limit: z.coerce.number().int().min(1).max(500).default(100)
  }).parse(req.query);
  res.json({ jobs: await listBotInboundJobs(query.limit) });
});
