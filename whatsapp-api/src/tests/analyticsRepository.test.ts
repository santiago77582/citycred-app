import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { applyTestEnv } from './helpers/entornoPruebas.js';
import { prepararBaseEnMemoria } from './helpers/baseEnMemoria.js';

applyTestEnv();
const base = await prepararBaseEnMemoria();
const { getOperationalDashboard } = await import('../analyticsRepository.js');
const { syncWhatsappTemplates } = await import('../templateRepository.js');

test.afterEach(() => base.reiniciar());

async function insertContact(params: {
  waId: string;
  name: string;
  entity?: string | null;
  commercialStatus: string;
  consentStatus: string;
  optOut?: boolean;
}): Promise<string> {
  const id = randomUUID();
  await base.consultar(
    `INSERT INTO contacts (
       id, wa_id, phone, profile_name, entity, commercial_status,
       consent_status, opt_out_at
     ) VALUES ($1, $2, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      params.waId,
      params.name,
      params.entity ?? null,
      params.commercialStatus,
      params.consentStatus,
      params.optOut ? new Date().toISOString() : null
    ]
  );
  return id;
}

async function insertConversation(params: {
  contactId: string;
  lastMessageAt: Date;
  assignedUserId?: string | null;
  botPausedUntil?: Date | null;
}): Promise<string> {
  const id = randomUUID();
  await base.consultar(
    `INSERT INTO conversations (
       id, contact_id, last_message_at, assigned_user_id, bot_paused_until
     ) VALUES ($1, $2, $3, $4, $5)`,
    [
      id,
      params.contactId,
      params.lastMessageAt.toISOString(),
      params.assignedUserId ?? null,
      params.botPausedUntil?.toISOString() ?? null
    ]
  );
  return id;
}

async function insertMessage(params: {
  conversationId: string;
  direction: 'INBOUND' | 'OUTBOUND';
  status: string;
  type: string;
  createdAt: Date;
}): Promise<void> {
  await base.consultar(
    `INSERT INTO messages (
       id, conversation_id, direction, type, text, status, raw, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, '{}'::jsonb, $7, $7)`,
    [
      randomUUID(),
      params.conversationId,
      params.direction,
      params.type,
      params.type,
      params.status,
      params.createdAt.toISOString()
    ]
  );
}

async function seedDashboardData(): Promise<void> {
  const userId = randomUUID();
  await base.consultar(
    `INSERT INTO app_users (id, email, display_name, password_hash, role)
     VALUES ($1, 'asesor@citycred.test', 'Asesor prueba', 'hash-prueba', 'ADVISOR')`,
    [userId]
  );

  const contactOne = await insertContact({
    waId: '5492911111111',
    name: 'Cliente uno',
    entity: 'Educación RN',
    commercialStatus: 'INTERESTED',
    consentStatus: 'GRANTED'
  });
  const contactTwo = await insertContact({
    waId: '5492912222222',
    name: 'Cliente dos',
    entity: 'Educación RN',
    commercialStatus: 'PENDING',
    consentStatus: 'UNKNOWN'
  });
  const contactThree = await insertContact({
    waId: '5492913333333',
    name: 'Cliente tres',
    entity: 'Ejército',
    commercialStatus: 'APPROVED',
    consentStatus: 'REVOKED',
    optOut: true
  });
  const contactFour = await insertContact({
    waId: '5492914444444',
    name: 'Cliente cuatro',
    entity: 'Ejército',
    commercialStatus: 'DO_NOT_CONTACT',
    consentStatus: 'GRANTED'
  });
  await insertContact({
    waId: '5492915555555',
    name: 'Cliente cinco',
    entity: null,
    commercialStatus: 'FINALIZED',
    consentStatus: 'GRANTED'
  });

  const today = new Date();
  const todayNoon = new Date(Date.UTC(
    today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 12, 0, 0, 0
  ));
  const oldDate = new Date(todayNoon.getTime() - 20 * 86_400_000);
  const pausedUntil = new Date(Date.now() + 60 * 60_000);

  const conversationOne = await insertConversation({
    contactId: contactOne,
    lastMessageAt: todayNoon,
    assignedUserId: userId,
    botPausedUntil: pausedUntil
  });
  const conversationTwo = await insertConversation({
    contactId: contactTwo,
    lastMessageAt: todayNoon
  });
  const conversationThree = await insertConversation({
    contactId: contactThree,
    lastMessageAt: oldDate
  });

  await insertMessage({
    conversationId: conversationOne,
    direction: 'INBOUND',
    status: 'RECEIVED',
    type: 'text',
    createdAt: new Date(todayNoon.getTime())
  });
  await insertMessage({
    conversationId: conversationOne,
    direction: 'OUTBOUND',
    status: 'DELIVERED',
    type: 'text',
    createdAt: new Date(todayNoon.getTime() + 5 * 60_000)
  });
  await insertMessage({
    conversationId: conversationTwo,
    direction: 'INBOUND',
    status: 'RECEIVED',
    type: 'image',
    createdAt: new Date(todayNoon.getTime() + 20 * 60_000)
  });
  await insertMessage({
    conversationId: conversationTwo,
    direction: 'OUTBOUND',
    status: 'READ',
    type: 'template',
    createdAt: new Date(todayNoon.getTime() + 35 * 60_000)
  });
  await insertMessage({
    conversationId: conversationOne,
    direction: 'OUTBOUND',
    status: 'FAILED',
    type: 'template',
    createdAt: new Date(todayNoon.getTime() + 40 * 60_000)
  });
  await insertMessage({
    conversationId: conversationOne,
    direction: 'OUTBOUND',
    status: 'UNKNOWN',
    type: 'document',
    createdAt: new Date(todayNoon.getTime() + 45 * 60_000)
  });
  await insertMessage({
    conversationId: conversationOne,
    direction: 'OUTBOUND',
    status: 'PENDING',
    type: 'video',
    createdAt: new Date(todayNoon.getTime() + 50 * 60_000)
  });
  await insertMessage({
    conversationId: conversationThree,
    direction: 'INBOUND',
    status: 'RECEIVED',
    type: 'text',
    createdAt: oldDate
  });

  await syncWhatsappTemplates([{
    metaTemplateId: 'analytics-template',
    name: 'analytics_template',
    languageCode: 'es_AR',
    category: 'UTILITY',
    status: 'APPROVED',
    components: [],
    rejectionReason: null
  }]);
  const template = await base.consultar(
    `SELECT id FROM whatsapp_templates WHERE name = 'analytics_template'`
  );
  const templateId = String(template.rows[0]?.id);
  for (const status of ['DRAFT', 'PREVIEWED', 'CANCELLED']) {
    await base.consultar(
      `INSERT INTO campaigns (
         id, name, template_id, status, audience_filter
       ) VALUES ($1, $2, $3, $4, '{}'::jsonb)`,
      [randomUUID(), `Campaña ${status}`, templateId, status]
    );
  }

  await base.consultar(
    `INSERT INTO system_alerts (id, severity, source, title, details)
     VALUES ($1, 'CRITICAL', 'analytics-test', 'Alerta crítica', '{}'::jsonb)`,
    [randomUUID()]
  );
  await base.consultar(
    `INSERT INTO system_alerts (id, severity, source, title, details)
     VALUES ($1, 'WARNING', 'analytics-test', 'Alerta de advertencia', '{}'::jsonb)`,
    [randomUUID()]
  );
  await base.consultar(
    `INSERT INTO system_alerts (
       id, severity, source, title, details, acknowledged_at
     ) VALUES ($1, 'INFO', 'analytics-test', 'Alerta reconocida', '{}'::jsonb, NOW())`,
    [randomUUID()]
  );

  assert.ok(contactFour);
}

test('calcula contactos, mensajes, tiempos, campañas y alertas', async () => {
  await seedDashboardData();
  const dashboard = await getOperationalDashboard(7);

  assert.equal(dashboard.period.days, 7);
  assert.equal(dashboard.contacts.total, 5);
  assert.equal(dashboard.contacts.consentGranted, 3);
  assert.equal(dashboard.contacts.consentUnknown, 1);
  assert.equal(dashboard.contacts.consentRevoked, 1);
  assert.equal(dashboard.contacts.doNotContact, 2);
  assert.equal(dashboard.contacts.byCommercialStatus.INTERESTED, 1);
  assert.deepEqual(dashboard.contacts.topEntities.slice(0, 2), [
    { entity: 'Educación RN', count: 2 },
    { entity: 'Ejército', count: 2 }
  ]);

  assert.equal(dashboard.conversations.total, 3);
  assert.equal(dashboard.conversations.activeInPeriod, 2);
  assert.equal(dashboard.conversations.assigned, 1);
  assert.equal(dashboard.conversations.unassigned, 2);
  assert.equal(dashboard.conversations.botPausedNow, 1);

  assert.equal(dashboard.messages.totalInPeriod, 7);
  assert.equal(dashboard.messages.inbound, 2);
  assert.equal(dashboard.messages.outbound, 5);
  assert.equal(dashboard.messages.failed, 1);
  assert.equal(dashboard.messages.unknown, 1);
  assert.equal(dashboard.messages.pending, 1);
  assert.equal(dashboard.messages.deliveredOrRead, 2);
  assert.equal(dashboard.messages.deliveryRatePercent, 40);
  assert.equal(dashboard.messages.byStatus.RECEIVED, 2);
  assert.equal(dashboard.messages.byType.template, 2);

  assert.equal(dashboard.responseTime.measuredConversations, 2);
  assert.equal(dashboard.responseTime.measuredResponses, 2);
  assert.equal(dashboard.responseTime.averageMinutes, 10);
  assert.equal(dashboard.responseTime.medianMinutes, 10);

  const today = new Date().toISOString().slice(0, 10);
  const daily = dashboard.daily.find((row) => row.date === today);
  assert.equal(daily?.inbound, 2);
  assert.equal(daily?.outbound, 5);
  assert.equal(daily?.failed, 1);

  assert.deepEqual(dashboard.campaigns, {
    total: 3,
    drafts: 1,
    previewed: 1,
    cancelled: 1
  });
  assert.equal(dashboard.alerts.open, 3);
  assert.equal(dashboard.alerts.criticalOpen, 1);
  assert.deepEqual(dashboard.limits, {
    messagesTruncated: false,
    contactsTruncated: false,
    conversationsTruncated: false
  });
});

test('devuelve valores nulos seguros cuando no hay mensajes salientes', async () => {
  const dashboard = await getOperationalDashboard(30);
  assert.equal(dashboard.messages.totalInPeriod, 0);
  assert.equal(dashboard.messages.deliveryRatePercent, null);
  assert.equal(dashboard.responseTime.averageMinutes, null);
  assert.equal(dashboard.responseTime.medianMinutes, null);
  assert.equal(dashboard.daily.length, 30);
});
