import { Router } from 'express';
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
  status: z.enum(['READY', 'SKIPPED']).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200)
});

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

campaignsRouter.get('/', async (req, res) => {
  const { limit } = listSchema.parse(req.query);
  res.json({
    executionEnabled: false,
    campaigns: await listCampaigns(limit)
  });
});

campaignsRouter.post('/', writeLimiter, async (req, res) => {
  const input = draftSchema.parse(req.body);
  const campaign = await createCampaignDraft(input, null);
  res.status(201).json({ executionEnabled: false, campaign });
});

campaignsRouter.get('/:campaignId', async (req, res) => {
  const { campaignId } = idSchema.parse(req.params);
  res.json({ executionEnabled: false, campaign: await getCampaignById(campaignId) });
});

campaignsRouter.put('/:campaignId', writeLimiter, async (req, res) => {
  const { campaignId } = idSchema.parse(req.params);
  const input = draftSchema.parse(req.body);
  const campaign = await updateCampaignDraft(campaignId, input, null);
  res.json({ executionEnabled: false, campaign });
});

campaignsRouter.post('/:campaignId/preview', previewLimiter, async (req, res) => {
  const { campaignId } = idSchema.parse(req.params);
  const preview = await previewCampaign(campaignId, null);
  res.json({ executionEnabled: false, preview });
});

campaignsRouter.get('/:campaignId/recipients', async (req, res) => {
  const { campaignId } = idSchema.parse(req.params);
  const query = recipientsSchema.parse(req.query);
  const recipients = await listCampaignRecipients(campaignId, query.status, query.limit);
  res.json({ campaignId, executionEnabled: false, recipients });
});

campaignsRouter.post('/:campaignId/cancel', writeLimiter, async (req, res) => {
  const { campaignId } = idSchema.parse(req.params);
  const campaign = await cancelCampaignDraft(campaignId, null);
  res.json({ executionEnabled: false, campaign });
});
