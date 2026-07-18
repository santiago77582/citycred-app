import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { CRM_CORE_JS } from '../admin/crmClientCore.js';
import { CRM_SETTINGS_JS } from '../admin/crmClientSettings.js';
import { CRM_HTML } from '../admin/crmPage.js';
import { CRM_CSS } from '../admin/crmStyle.js';
import { MEDIA_COMPOSER_JS } from '../admin/mediaComposer.js';
import { MEDIA_COMPOSER_CSS } from '../admin/mediaComposerStyle.js';
import { TEMPLATE_COMPOSER_JS } from '../admin/templateComposer.js';
import { TEMPLATE_UI_CSS } from '../admin/templateUiStyle.js';
import { ADMIN_CSS, ADMIN_JS, DASHBOARD_HTML, LOGIN_HTML } from '../admin/ui.js';
import {
  clearAdminSession,
  isValidAdminPassword,
  requireAdminSession,
  setAdminSession
} from '../middleware/adminSession.js';
import {
  listConversations,
  listMessagesByWaId,
  setConversationBotPause
} from '../repository.js';
import { normalizePhone } from '../utils/phone.js';
import { campaignsRouter } from './campaigns.js';
import { crmRouter } from './crm.js';
import { mediaRouter } from './media.js';
import { sendTextAndPersist } from './messages.js';
import { templatesRouter } from './templates.js';

export const adminRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: 'Demasiados intentos. Esperá unos minutos y probá nuevamente.'
});

const conversationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100)
});

const messagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(200)
});

const textSchema = z.object({
  to: z.string().min(1),
  body: z.string().min(1).max(4096)
});

const pauseSchema = z.object({
  minutes: z.coerce.number().int().min(0).max(10_080)
});

adminRouter.get('/assets/app.css', (_req, res) => {
  res.type('text/css').send(`${ADMIN_CSS}\n${MEDIA_COMPOSER_CSS}\n${TEMPLATE_UI_CSS}`);
});
adminRouter.get('/assets/crm.css', (_req, res) => {
  res.type('text/css').send(`${CRM_CSS}\n${TEMPLATE_UI_CSS}`);
});

adminRouter.get('/login', (_req, res) => {
  res.type('html').send(LOGIN_HTML);
});

adminRouter.post('/login', loginLimiter, (req, res) => {
  const candidate = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!isValidAdminPassword(candidate)) {
    res
      .status(401)
      .type('html')
      .send(LOGIN_HTML.replace('<!--ERROR-->', '<div class="alert">Contraseña incorrecta.</div>'));
    return;
  }
  setAdminSession(res);
  res.redirect(303, '/admin');
});

adminRouter.post('/logout', (_req, res) => {
  clearAdminSession(res);
  res.status(204).end();
});

adminRouter.use(requireAdminSession);
adminRouter.use('/api/crm', crmRouter);
adminRouter.use('/api/media', mediaRouter);
adminRouter.use('/api/templates', templatesRouter);
adminRouter.use('/api/campaigns', campaignsRouter);

adminRouter.get('/assets/app.js', (_req, res) => {
  res
    .type('application/javascript')
    .send(`${ADMIN_JS}\n${MEDIA_COMPOSER_JS}\n${TEMPLATE_COMPOSER_JS}`);
});
adminRouter.get('/assets/crm.js', (_req, res) => {
  res.type('application/javascript').send(`${CRM_CORE_JS}\n${CRM_SETTINGS_JS}`);
});

adminRouter.get('/', (_req, res) => {
  res.type('html').send(DASHBOARD_HTML);
});
adminRouter.get('/crm', (_req, res) => {
  res.type('html').send(CRM_HTML);
});

adminRouter.get('/api/conversations', async (req, res) => {
  const { limit } = conversationQuerySchema.parse(req.query);
  res.json({ conversations: await listConversations(limit) });
});

adminRouter.get('/api/conversations/:waId/messages', async (req, res) => {
  const { limit } = messagesQuerySchema.parse(req.query);
  const waId = normalizePhone(String(req.params.waId));
  res.json({ waId, messages: await listMessagesByWaId(waId, limit) });
});

adminRouter.post('/api/messages/text', async (req, res) => {
  const input = textSchema.parse(req.body);
  const outcome = await sendTextAndPersist(input);
  const botPausedUntil = await setConversationBotPause(
    normalizePhone(input.to),
    new Date(Date.now() + 5 * 60_000)
  );
  res.status(outcome.statusCode).json({ ...outcome.payload, botPausedUntil });
});

adminRouter.post('/api/conversations/:waId/pause', async (req, res) => {
  const { minutes } = pauseSchema.parse(req.body);
  const waId = normalizePhone(String(req.params.waId));
  const pausedUntil = minutes === 0 ? null : new Date(Date.now() + minutes * 60_000);
  const botPausedUntil = await setConversationBotPause(waId, pausedUntil);
  res.json({ waId, botPausedUntil });
});
