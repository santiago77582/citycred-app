import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { ANALYTICS_UI_CSS } from '../admin/analyticsUiStyle.js';
import { CAMPAIGN_UI_CSS } from '../admin/campaignUiStyle.js';
import { CRM_ANALYTICS_JS } from '../admin/crmClientAnalytics.js';
import { CRM_CORE_JS } from '../admin/crmClientCore.js';
import { CRM_IMPORTS_JS } from '../admin/crmClientImports.js';
import { CRM_SETTINGS_JS } from '../admin/crmClientSettings.js';
import { INDIVIDUAL_LOGIN_HTML } from '../admin/loginUi.js';
import { CRM_HTML } from '../admin/crmPage.js';
import { CRM_CSS } from '../admin/crmStyle.js';
import { MEDIA_COMPOSER_JS } from '../admin/mediaComposer.js';
import { MEDIA_COMPOSER_CSS } from '../admin/mediaComposerStyle.js';
import { PLATFORM_ACCOUNT_JS } from '../admin/platformClientAccount.js';
import { PLATFORM_BOT_JS } from '../admin/platformClientBot.js';
import { PLATFORM_CORE_JS } from '../admin/platformClientCore.js';
import { PLATFORM_FLOWS_JS } from '../admin/platformClientFlows.js';
import { PLATFORM_INIT_JS, PLATFORM_NAV_JS } from '../admin/platformClientInit.js';
import { PLATFORM_HTML } from '../admin/platformPage.js';
import { PLATFORM_CSS } from '../admin/platformStyle.js';
import { TEMPLATE_COMPOSER_JS } from '../admin/templateComposer.js';
import { TEMPLATE_UI_CSS } from '../admin/templateUiStyle.js';
import { ADMIN_CSS, ADMIN_JS, DASHBOARD_HTML } from '../admin/ui.js';
import { writeAuditEvent } from '../crm/auditRepository.js';
import { authenticateUser } from '../crm/teamRepository.js';
import {
  clearAdminSession,
  isValidAdminPassword,
  requireAdminSession,
  requirePanelRole,
  setAdminSession
} from '../middleware/adminSession.js';
import {
  listConversations,
  listMessagesByWaId,
  setConversationBotPause
} from '../repository.js';
import { normalizePhone } from '../utils/phone.js';
import { accountRouter } from './account.js';
import { analyticsRouter } from './analytics.js';
import { botRouter } from './bot.js';
import { campaignsRouter } from './campaigns.js';
import { contactImportsRouter } from './contactImports.js';
import { commerceRouter } from './commerce.js';
import { crmRouter } from './crm.js';
import { flowsRouter } from './flows.js';
import { mediaRouter } from './media.js';
import { sendTextAndPersist } from './messages.js';
import { metaAnalyticsRouter } from './metaAnalytics.js';
import { templatesRouter } from './templates.js';

export const adminRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: 'Demasiados intentos. Esperá unos minutos y probá nuevamente.'
});

const loginSchema = z.object({
  email: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().email().max(254).optional()
  ),
  password: z.string().min(1).max(200)
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

function loginError(res: Parameters<typeof adminRouter.post>[1] extends never ? never : any): void {
  res
    .status(401)
    .type('html')
    .send(
      INDIVIDUAL_LOGIN_HTML.replace(
        '<!--ERROR-->',
        '<div class="alert">Correo o contraseña incorrectos.</div>'
      )
    );
}

adminRouter.get('/assets/app.css', (_req, res) => {
  res.type('text/css').send(`${ADMIN_CSS}\n${MEDIA_COMPOSER_CSS}\n${TEMPLATE_UI_CSS}`);
});
adminRouter.get('/assets/crm.css', (_req, res) => {
  res
    .type('text/css')
    .send(`${CRM_CSS}\n${TEMPLATE_UI_CSS}\n${CAMPAIGN_UI_CSS}\n${ANALYTICS_UI_CSS}`);
});
adminRouter.get('/assets/platform.css', (_req, res) => {
  res.type('text/css').send(PLATFORM_CSS);
});

adminRouter.get('/login', (_req, res) => {
  res.type('html').send(INDIVIDUAL_LOGIN_HTML);
});

adminRouter.post('/login', loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    loginError(res);
    return;
  }

  if (parsed.data.email) {
    const user = await authenticateUser(parsed.data.email, parsed.data.password);
    if (!user) {
      loginError(res);
      return;
    }
    setAdminSession(res, user);
    res.redirect(303, '/admin');
    return;
  }

  if (!isValidAdminPassword(parsed.data.password)) {
    loginError(res);
    return;
  }
  setAdminSession(res, null);
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
adminRouter.use(
  '/api/campaigns',
  requirePanelRole('ADMIN', 'SUPERVISOR'),
  campaignsRouter
);
adminRouter.use(
  '/api/imports',
  requirePanelRole('ADMIN', 'SUPERVISOR'),
  contactImportsRouter
);
adminRouter.use(
  '/api/analytics',
  requirePanelRole('ADMIN', 'SUPERVISOR'),
  analyticsRouter
);

const platformAdminOnly = requirePanelRole('ADMIN');
adminRouter.use('/api/platform/bot', platformAdminOnly, botRouter);
adminRouter.use('/api/platform/account', platformAdminOnly, accountRouter);
adminRouter.use('/api/platform/commerce', platformAdminOnly, commerceRouter);
adminRouter.use('/api/platform/flows', platformAdminOnly, flowsRouter);
adminRouter.use('/api/platform/meta-analytics', platformAdminOnly, metaAnalyticsRouter);

adminRouter.get('/assets/app.js', (_req, res) => {
  res
    .type('application/javascript')
    .send(`${ADMIN_JS}\n${MEDIA_COMPOSER_JS}\n${TEMPLATE_COMPOSER_JS}\n${PLATFORM_NAV_JS}`);
});
adminRouter.get('/assets/crm.js', (_req, res) => {
  res
    .type('application/javascript')
    .send(`${CRM_CORE_JS}\n${CRM_SETTINGS_JS}\n${CRM_IMPORTS_JS}\n${CRM_ANALYTICS_JS}\n${PLATFORM_NAV_JS}`);
});
adminRouter.get('/assets/platform.js', platformAdminOnly, (_req, res) => {
  res
    .type('application/javascript')
    .send(`${PLATFORM_CORE_JS}\n${PLATFORM_BOT_JS}\n${PLATFORM_ACCOUNT_JS}\n${PLATFORM_FLOWS_JS}\n${PLATFORM_INIT_JS}`);
});

adminRouter.get('/', (_req, res) => {
  res.type('html').send(DASHBOARD_HTML);
});
adminRouter.get('/crm', (_req, res) => {
  res.type('html').send(CRM_HTML);
});
adminRouter.get('/platform', platformAdminOnly, (_req, res) => {
  res.type('html').send(PLATFORM_HTML);
});

adminRouter.get('/api/session', (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.json({ user: req.adminUser });
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
  const waId = normalizePhone(input.to);
  const botPausedUntil = await setConversationBotPause(
    waId,
    new Date(Date.now() + 5 * 60_000)
  );
  await writeAuditEvent({
    actorUserId: req.adminUser?.userId ?? null,
    action: 'MANUAL_MESSAGE_SENT',
    entityType: 'CONTACT',
    entityId: waId,
    afterData: {
      messageId: outcome.payload.messageId,
      wamid: outcome.payload.wamid,
      status: outcome.payload.status
    }
  });
  res.status(outcome.statusCode).json({ ...outcome.payload, botPausedUntil });
});

adminRouter.post('/api/conversations/:waId/pause', async (req, res) => {
  const { minutes } = pauseSchema.parse(req.body);
  const waId = normalizePhone(String(req.params.waId));
  const pausedUntil = minutes === 0 ? null : new Date(Date.now() + minutes * 60_000);
  const botPausedUntil = await setConversationBotPause(waId, pausedUntil);
  await writeAuditEvent({
    actorUserId: req.adminUser?.userId ?? null,
    action: minutes === 0 ? 'BOT_RESUMED' : 'BOT_PAUSED',
    entityType: 'CONTACT',
    entityId: waId,
    afterData: { minutes, botPausedUntil }
  });
  res.json({ waId, botPausedUntil });
});
