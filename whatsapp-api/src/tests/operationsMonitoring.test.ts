import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { applyTestEnv } from './helpers/entornoPruebas.js';
import { prepararBaseEnMemoria } from './helpers/baseEnMemoria.js';

applyTestEnv();
const base = await prepararBaseEnMemoria();
const {
  acknowledgeOperationalAlert,
  getOperationalOverview,
  listOperationalAlerts,
  resolveOperationalAlert,
  runOperationalChecks
} = await import('../operationsRepository.js');
const { syncWhatsappTemplates } = await import('../templateRepository.js');

test.afterEach(() => base.reiniciar());

async function seedProblems(): Promise<void> {
  const contactId = randomUUID();
  const conversationId = randomUUID();
  await base.consultar(
    `INSERT INTO contacts (
       id, wa_id, phone, profile_name, commercial_status,
       consent_status, opt_out_at
     ) VALUES ($1, '5492911111111', '5492911111111', 'Cliente problema',
               'DO_NOT_CONTACT', 'REVOKED', NOW())`,
    [contactId]
  );
  await base.consultar(
    `INSERT INTO conversations (id, contact_id, last_message_at)
     VALUES ($1, $2, NOW())`,
    [conversationId, contactId]
  );
  await base.consultar(
    `INSERT INTO messages (
       id, conversation_id, direction, type, text, status, raw,
       created_at, updated_at
     ) VALUES
       ($1, $2, 'OUTBOUND', 'text', 'fallido', 'FAILED', '{}'::jsonb,
        NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '10 minutes'),
       ($3, $2, 'OUTBOUND', 'text', 'desconocido', 'UNKNOWN', '{}'::jsonb,
        NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '30 minutes'),
       ($4, $2, 'OUTBOUND', 'text', 'pendiente', 'PENDING', '{}'::jsonb,
        NOW() - INTERVAL '3 hours', NOW() - INTERVAL '3 hours')`,
    [randomUUID(), conversationId, randomUUID(), randomUUID()]
  );
  await base.consultar(
    `INSERT INTO webhook_events (
       id, payload, received_at, processed_at, error
     ) VALUES ($1, '{}'::jsonb, NOW() - INTERVAL '20 minutes', NULL, 'error simulado')`,
    [randomUUID()]
  );

  await syncWhatsappTemplates([
    {
      metaTemplateId: 'ops-template',
      name: 'ops_template',
      languageCode: 'es_AR',
      category: 'MARKETING',
      status: 'APPROVED',
      components: [],
      rejectionReason: null
    }
  ]);
  const template = await base.consultar(
    `SELECT id FROM whatsapp_templates WHERE name = 'ops_template'`
  );
  const campaignId = randomUUID();
  await base.consultar(
    `INSERT INTO campaigns (
       id, name, template_id, status, audience_filter
     ) VALUES ($1, 'Campaña activa simulada', $2, 'RUNNING', '{}'::jsonb)`,
    [campaignId, String(template.rows[0]?.id)]
  );
  await base.consultar(
    `INSERT INTO campaign_recipients (
       id, campaign_id, contact_id, status
     ) VALUES ($1, $2, $3, 'READY')`,
    [randomUUID(), campaignId, contactId]
  );
}

test('detecta problemas y crea una sola alerta por verificación', async () => {
  await seedProblems();
  const first = await runOperationalChecks('MANUAL');
  assert.equal(first.status, 'CRITICAL');
  assert.ok(first.summary.critical >= 3);
  assert.ok(first.checks.some((check) => check.key === 'messages' && check.severity === 'WARNING'));
  assert.ok(first.checks.some((check) => check.key === 'webhooks' && check.severity === 'WARNING'));
  assert.ok(first.checks.some((check) => check.key === 'campaign_safety' && check.severity === 'CRITICAL'));
  assert.ok(first.checks.some((check) => check.key === 'campaign_eligibility' && check.severity === 'CRITICAL'));

  const alertsAfterFirst = await listOperationalAlerts({ includeResolved: false, limit: 100 });
  const fingerprints = alertsAfterFirst.map((alert) => alert.fingerprint);
  assert.equal(new Set(fingerprints).size, fingerprints.length);
  assert.ok(fingerprints.includes('operations:messages'));
  assert.ok(fingerprints.includes('operations:webhooks'));
  assert.ok(fingerprints.includes('operations:campaign_safety'));
  assert.ok(fingerprints.includes('operations:campaign_eligibility'));

  await runOperationalChecks('MANUAL');
  const alertsAfterSecond = await listOperationalAlerts({ includeResolved: false, limit: 100 });
  assert.equal(alertsAfterSecond.length, alertsAfterFirst.length);
  const messagesAlert = alertsAfterSecond.find((alert) => alert.fingerprint === 'operations:messages');
  assert.equal(messagesAlert?.occurrenceCount, 2);
});

test('reconoce y resuelve alertas operativas', async () => {
  await seedProblems();
  await runOperationalChecks('MANUAL');
  const alerts = await listOperationalAlerts({ includeResolved: false, limit: 100 });
  const messagesAlert = alerts.find((alert) => alert.fingerprint === 'operations:messages');
  assert.ok(messagesAlert);

  const acknowledged = await acknowledgeOperationalAlert(String(messagesAlert?.id));
  assert.ok(acknowledged.acknowledgedAt);
  assert.equal(acknowledged.resolvedAt, null);

  const resolved = await resolveOperationalAlert(String(messagesAlert?.id));
  assert.ok(resolved.resolvedAt);
  const open = await listOperationalAlerts({ includeResolved: false, limit: 100 });
  assert.equal(open.some((alert) => alert.id === messagesAlert?.id), false);
});

test('resuelve automáticamente una alerta cuando la condición desaparece', async () => {
  await seedProblems();
  await runOperationalChecks('MANUAL');

  await base.consultar(
    `UPDATE messages SET status = 'DELIVERED', updated_at = NOW()`
  );
  await base.consultar(
    `UPDATE webhook_events SET processed_at = NOW(), error = NULL`
  );
  await base.consultar(
    `UPDATE campaigns SET status = 'CANCELLED'`
  );
  await base.consultar(
    `UPDATE campaign_recipients SET status = 'SKIPPED', skip_reason = 'DO_NOT_CONTACT'`
  );

  const second = await runOperationalChecks('MANUAL');
  const messagesCheck = second.checks.find((check) => check.key === 'messages');
  const webhookCheck = second.checks.find((check) => check.key === 'webhooks');
  const campaignCheck = second.checks.find((check) => check.key === 'campaign_safety');
  const eligibilityCheck = second.checks.find((check) => check.key === 'campaign_eligibility');
  assert.equal(messagesCheck?.severity, 'OK');
  assert.equal(webhookCheck?.severity, 'OK');
  assert.equal(campaignCheck?.severity, 'OK');
  assert.equal(eligibilityCheck?.severity, 'OK');

  const allAlerts = await listOperationalAlerts({ includeResolved: true, limit: 100 });
  for (const fingerprint of [
    'operations:messages',
    'operations:webhooks',
    'operations:campaign_safety',
    'operations:campaign_eligibility'
  ]) {
    const alert = allAlerts.find((item) => item.fingerprint === fingerprint);
    assert.ok(alert?.resolvedAt);
  }
});

test('el resumen devuelve la última ejecución y las alertas abiertas', async () => {
  await seedProblems();
  const run = await runOperationalChecks('STARTUP');
  const overview = await getOperationalOverview();
  assert.equal(overview.latestRun?.id, run.id);
  assert.ok(overview.alerts.length > 0);
});
