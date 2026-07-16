import { Router } from 'express';
import { z } from 'zod';
import { listConversations, listMessagesByWaId } from '../repository.js';
import { normalizePhone } from '../utils/phone.js';

export const conversationsRouter = Router();

const conversationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

const messagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100)
});

conversationsRouter.get('/', async (req, res) => {
  const { limit } = conversationsQuerySchema.parse(req.query);
  const conversations = await listConversations(limit);
  res.json({ conversations });
});

conversationsRouter.get('/:waId/messages', async (req, res) => {
  const { limit } = messagesQuerySchema.parse(req.query);
  const waId = normalizePhone(String(req.params.waId));
  const messages = await listMessagesByWaId(waId, limit);
  res.json({ waId, messages });
});
