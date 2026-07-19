import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  cancelCampaignDraft,
  createCampaignDraft,
  getCampaignById,
  listCampaignRecipients,
  listCampaigns,
  previewCampaign,
  updateCampaignDraft
} from '../campaignRepository.js';
import {
  approveCampaignExecution,
  campaignExecutionCapabilities,
  simulateCampaignExecution,
  startCampaignExecution
} from '../campaignExecutionRepository.js';
import { AppError } from '../errors/AppError.js';

export const campaignsRouter = Router();

const commercialStatusSchema = z.enum([
  'NEW', 'PENDING', 'INTERESTED', 'DOCUMENTATION_PENDING',
  'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'FINALIZED', 'DO_NOT_CONTACT'
]);

const audienceFilterSchema = z.object({
  entities: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  commercialStatuses: z.array(commercialStatusSchema).max(20).optional(),
  labelIds: z.array(z.string().uuid()).max(50).optional(),
  search: z.string().trim().max(200).optional(),
  updatedAfter: z.iso.datetime({ offset: true }).optional(),
  updatedBefore: z.iso.datetime({ offset: true }).optional()
}).strict();

const draftSchema = z.object({
  name: z.string().trim().min(3).max(150),
  templateId: z.string().uuid(),
  audienceFilter: audienceFilterSchema.default({}),
  templateComponents: z.array(z.unknown()).max(20).optional()
}).strict();

const idSchema = z.object({ campaignId: z.string().uuid() });
const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100)
});
const recipientsSchema = z.object({
  status: z.enum(['READY', 'SKIPPED', 'SENDING', 'SENT', 'FAILED', 'UNKNOWN']).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200)
});
const executionSchema = z.object({ confirmation: z.literal('ENVIAR') }).strict();

const writeLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiadas modificaciones de campañas. Esperá un minuto.' }
});

const previewLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiadas vistas previas. Esperá un minuto.' }
});

function actorUserId(req: Request): string | null {
  return req.adminUser?.userId ?? null;
}

function namedPanelUser(
  req: Request,
  requiredRole?: 'ADMIN'
): string {
  if (!req.adminUser || req.adminUser.emergency || !req.adminUser.userId) {
    throw new AppError('Esta operación exige una sesión individual del panel.', 403);
  }
  if (requiredRole && req.adminUser.role !== requiredRole) {
    throw new AppError('Solo un administrador puede realizar esta operación.', 403);
  }
  return req.adminUser.userId;
}

campaignsRouter.get('/capabilities', (_req, res) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.json({ execution: campaignExecutionCapabilities() });
});

campaignsRouter.get('/', async (req, res) => {
  const { limit } = listSchema.parse(req.query);
  res.json({
    executionEnabled: campaignExecutionCapabilities().enabled,
    execution: campaignExecutionCapabilities(),
    campaigns: await listCampaigns(limit)
  });
});

campaignsRouter.post('/', writeLimiter, async (req, res) => {
  const input = draftSchema.parse(req.body);
  const campaign = await createCampaignDraft(input, actorUserId(req));
  res.status(201).json({ executionEnabled: campaignExecutionCapabilities().enabled, campaign });
});

campaignsRouter.get('/:campaignId', async (req, res) => {
  const { campaignId } = idSchema.parse(req.params);
  res.json({
    executionEnabled: campaignExecutionCapabilities().enabled,
    campaign: await getCampaignById(campaignId)
  });
});

campaignsRouter.put('/:campaignId', writeLimiter, async (req, res) => {
  const { campaignId } = idSchema.parse(req.params);
  const input = draftSchema.parse(req.body);
  const campaign = await updateCampaignDraft(campaignId, input, actorUserId(req));
  res.json({ executionEnabled: campaignExecutionCapabilities().enabled, campaign });
});

campaignsRouter.post('/:campaignId/preview', previewLimiter, async (req, res) => {
  const { campaignId } = idSchema.parse(req.params);
  const preview = await previewCampaign(campaignId, actorUserId(req));
  res.json({ executionEnabled: campaignExecutionCapabilities().enabled, preview });
});

campaignsRouter.post('/:campaignId/simulate', previewLimiter, async (req, res) => {
  const { campaignId } = idSchema.parse(req.params);
  const actor = namedPanelUser(req);
  const simulation = await simulateCampaignExecution(campaignId, actor);
  res.json({ executionEnabled: campaignExecutionCapabilities().enabled, simulation });
});

campaignsRouter.post('/:campaignId/approve', writeLimiter, async (req, res) => {
  const { campaignId } = idSchema.parse(req.params);
  const actor = namedPanelUser(req, 'ADMIN');
  const campaign = await approveCampaignExecution(campaignId, actor);
  res.json({ executionEnabled: campaignExecutionCapabilities().enabled, campaign });
});

campaignsRouter.post('/:campaignId/execute', writeLimiter, async (req, res) => {
  const { campaignId } = idSchema.parse(req.params);
  executionSchema.parse(req.body);
  const actor = namedPanelUser(req, 'ADMIN');
  const campaign = await startCampaignExecution(campaignId, actor);
  res.status(202).json({ executionEnabled: true, campaign });
});

campaignsRouter.get('/:campaignId/recipients', async (req, res) => {
  const { campaignId } = idSchema.parse(req.params);
  const query = recipientsSchema.parse(req.query);
  const recipients = await listCampaignRecipients(campaignId, query.status, query.limit);
  res.json({
    campaignId,
    executionEnabled: campaignExecutionCapabilities().enabled,
    recipients
  });
});

campaignsRouter.post('/:campaignId/cancel', writeLimiter, async (req, res) => {
  const { campaignId } = idSchema.parse(req.params);
  const campaign = await cancelCampaignDraft(campaignId, actorUserId(req));
  res.json({ executionEnabled: campaignExecutionCapabilities().enabled, campaign });
});
