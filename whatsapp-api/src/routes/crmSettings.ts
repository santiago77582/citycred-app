import { Router } from 'express';
import { z } from 'zod';
import {
  createLabel,
  createQuickReply,
  listLabels,
  listQuickReplies
} from '../crm/catalogRepository.js';
import { createUser, listUsers, updateUser } from '../crm/teamRepository.js';
import { requirePanelRole } from '../middleware/adminSession.js';

export const crmSettingsRouter = Router();

const labelSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(250).nullable().optional(),
  color: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional()
});

const quickReplySchema = z.object({
  shortcut: z.string().trim().min(1).max(40).regex(/^\/[a-z0-9_-]+$/i),
  title: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(4096),
  category: z.string().trim().max(80).nullable().optional()
});

const roleSchema = z.enum(['ADMIN', 'SUPERVISOR', 'ADVISOR']);
const createUserSchema = z.object({
  email: z.string().email().max(254),
  displayName: z.string().trim().min(2).max(120),
  password: z.string().min(10).max(200),
  role: roleSchema
});
const updateUserSchema = z.object({
  displayName: z.string().trim().min(2).max(120).optional(),
  role: roleSchema.optional(),
  active: z.boolean().optional(),
  newPassword: z.string().min(10).max(200).optional()
}).refine((value) => Object.keys(value).length > 0, 'No hay cambios para guardar.');
const userParamsSchema = z.object({ userId: z.string().uuid() });

crmSettingsRouter.get('/labels', async (_req, res) => {
  res.json({ labels: await listLabels() });
});

crmSettingsRouter.post(
  '/labels',
  requirePanelRole('ADMIN', 'SUPERVISOR'),
  async (req, res) => {
    const input = labelSchema.parse(req.body);
    const label = await createLabel({
      ...input,
      actorUserId: req.adminUser?.userId ?? undefined
    });
    res.status(201).json({ label });
  }
);

crmSettingsRouter.get('/quick-replies', async (_req, res) => {
  res.json({ quickReplies: await listQuickReplies() });
});

crmSettingsRouter.post(
  '/quick-replies',
  requirePanelRole('ADMIN', 'SUPERVISOR'),
  async (req, res) => {
    const input = quickReplySchema.parse(req.body);
    const quickReply = await createQuickReply({
      ...input,
      actorUserId: req.adminUser?.userId ?? undefined
    });
    res.status(201).json({ quickReply });
  }
);

crmSettingsRouter.get(
  '/users',
  requirePanelRole('ADMIN', 'SUPERVISOR'),
  async (_req, res) => {
    res.json({ users: await listUsers() });
  }
);

crmSettingsRouter.post(
  '/users',
  requirePanelRole('ADMIN'),
  async (req, res) => {
    const input = createUserSchema.parse(req.body);
    const user = await createUser({
      ...input,
      actorUserId: req.adminUser?.userId ?? undefined
    });
    res.status(201).json({ user });
  }
);

crmSettingsRouter.patch(
  '/users/:userId',
  requirePanelRole('ADMIN'),
  async (req, res) => {
    const { userId } = userParamsSchema.parse(req.params);
    const input = updateUserSchema.parse(req.body);
    const user = await updateUser({
      userId,
      ...input,
      actorUserId: req.adminUser?.userId ?? undefined
    });
    res.json({ user });
  }
);
