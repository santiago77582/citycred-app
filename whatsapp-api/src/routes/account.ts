import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  getLatestMetaAccountState,
  listMetaAccountEvents
} from '../metaAccountEventsRepository.js';
import {
  getBusinessProfile,
  getCommerceSettings,
  getPhoneNumberStatus,
  updateBusinessProfile,
  updateCommerceSettings,
  uploadBusinessProfilePicture
} from '../services/metaManagement.js';

export const accountRouter = Router();

const verticalSchema = z.enum([
  'UNDEFINED', 'OTHER', 'AUTO', 'BEAUTY', 'APPAREL', 'EDU', 'ENTERTAIN',
  'EVENT_PLAN', 'FINANCE', 'GROCERY', 'GOVT', 'HOTEL', 'HEALTH',
  'NONPROFIT', 'PROF_SERVICES', 'RETAIL', 'TRAVEL', 'RESTAURANT', 'NOT_A_BIZ'
]);

const profileSchema = z.object({
  confirm: z.literal(true),
  about: z.string().trim().min(1).max(139).nullable().optional(),
  address: z.string().trim().max(256).nullable().optional(),
  description: z.string().trim().max(256).nullable().optional(),
  email: z.string().email().max(128).nullable().optional(),
  websites: z.array(z.url().refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  })).max(2).optional(),
  vertical: verticalSchema.nullable().optional(),
  profilePictureHandle: z.string().trim().min(1).max(1000).nullable().optional()
}).refine((value) => Object.keys(value).some((key) => key !== 'confirm'), {
  message: 'No hay cambios para guardar.'
});

const commerceSettingsSchema = z.object({
  confirm: z.literal(true),
  cartEnabled: z.boolean(),
  catalogVisible: z.boolean()
});

const pictureQuerySchema = z.object({ confirm: z.literal('true') });
const eventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  field: z.enum([
    'phone_number_name_update',
    'phone_number_quality_update',
    'account_update',
    'account_review_update',
    'message_template_status_update'
  ]).optional()
});

const managementLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiadas consultas de administración. Esperá un minuto.' }
});

accountRouter.use(managementLimiter);

accountRouter.get('/profile', async (_req, res) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.json({ profile: await getBusinessProfile() });
});

accountRouter.patch('/profile', async (req, res) => {
  const { confirm: _confirm, ...profile } = profileSchema.parse(req.body);
  res.json({ result: await updateBusinessProfile(profile) });
});

accountRouter.post(
  '/profile-picture',
  express.raw({ type: ['image/jpeg', 'image/png'], limit: '5mb' }),
  async (req, res) => {
    pictureQuerySchema.parse(req.query);
    const mimeType = req.header('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') {
      res.status(415).json({ error: 'La foto debe ser JPEG o PNG.' });
      return;
    }
    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    res.json({
      result: await uploadBusinessProfilePicture({ bytes, mimeType })
    });
  }
);

accountRouter.get('/phone-number', async (_req, res) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.json({ phoneNumber: await getPhoneNumberStatus() });
});

accountRouter.get('/events', async (req, res) => {
  const query = eventsQuerySchema.parse(req.query);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.json({
    events: await listMetaAccountEvents({
      limit: query.limit,
      field: query.field
    })
  });
});

accountRouter.get('/state', async (_req, res) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.json({ state: await getLatestMetaAccountState() });
});

accountRouter.get('/commerce-settings', async (_req, res) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.json({ commerce: await getCommerceSettings() });
});

accountRouter.patch('/commerce-settings', async (req, res) => {
  const input = commerceSettingsSchema.parse(req.body);
  res.json({
    result: await updateCommerceSettings({
      cartEnabled: input.cartEnabled,
      catalogVisible: input.catalogVisible
    })
  });
});
