import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { applyTestEnv } from './helpers/entornoPruebas.js';
import { prepararBaseEnMemoria } from './helpers/baseEnMemoria.js';

applyTestEnv({
  CAMPAIGN_EXECUTION_ENABLED: 'true',
  CAMPAIGN_MAX_RECIPIENTS: '10',
  CAMPAIGN_PREVIEW_TTL_MINUTES: '60'
});
const base = await prepararBaseEnMemoria();
const { createCampaignDraft, getCampaignById, previewCampaign } =
  await import('../campaignRepository.js');
const {
  approveCampaignExecution,
  startCampaignExecution
} = await import('../campaignExecutionRepository.js');
const { runCampaignWorkerBatch } = await import('../campaignWorker.js');
const { createUser } = await import('../crm/teamRepository.js');
const { syncWhatsappTemplates } = await import('../templateRepository.js');

test.afterEach(() => base.reiniciar());

const businessTime = new Date('2026-07-20T13:00:00.000Z');

async function seed(): Promise<{
  campaignId: string;
  contactId: string;
  creatorId: string;
  approverId: string;
}> {
  const creator = await createUser({
    email: 'creador-campania@citycred.test',
    displayName: 'Creador Campaña',
    password: 'ClaveCreador123!',
    role: 'ADMIN'
  });
  const approver = await createUser({
    email: 'aprobador-campania@citycred.test',
    displayName: 'Aprobador Campaña',
    password: 'ClaveAprobador123!',
    role: 'ADMIN'
  });
  await syncWhatsappTemplates([{
    metaTemplateId: 'meta-execution-approved',
    name: 'campania_ejecucion',
    languageCode: 'es_AR',
    category: 'MARKETING',
    status: 'APPROVED',
    components: [{ type: 'BODY', text: 'Hola' }],
    rejectionReason: null
  }]);
  const template = await base.consultar(
    `SELECT id FROM whatsapp_templates WHERE name = 'campania_ejecucion'`
  );
  const contactId = randomUUID();
  await base.consultar(
    `INSERT INTO contacts (
       id, wa_id, phone, profile_name, commercial_status, consent_status
     ) VALUES ($1, '5492918888888', '5492918888888', 'Cliente', 'INTERESTED', 'GRANTED')`,
    [contactId]
  );
  const campaign = await createCampaignDraft({
    name: 'Campaña con doble control',
    templateId: String(template.rows[0]?.id),
    audienceFilter: {}
  }, creator.id);
  await previewCampaign(campaign.id, creator.id);
  return {
    campaignId: campaign.id,
    contactId,
    creatorId: creator.id,
    approverId: approver.id
  };
}

test('exige aprobador distinto y ejecutor distinto del aprobador', async () => {
  const seeded = await seed();
  await assert.rejects(
    () => approveCampaignExecution(seeded.campaignId, seeded.creatorId),
    /no puede aprobar su propia/i
  );

  const approved = await approveCampaignExecution(seeded.campaignId, seeded.approverId);
  assert.equal(approved.status, 'APPROVED');
  assert.equal(approved.approvedBy, seeded.approverId);

  await assert.rejects(
    () => startCampaignExecution(seeded.campaignId, seeded.approverId, businessTime),
    /no puede iniciar/i
  );
  const running = await startCampaignExecution(
    seeded.campaignId,
    seeded.creatorId,
    businessTime
  );
  assert.equal(running.status, 'RUNNING');
  assert.equal(running.startedBy, seeded.creatorId);
});

test('envía una sola vez y completa la campaña', async () => {
  const seeded = await seed();
  await approveCampaignExecution(seeded.campaignId, seeded.approverId);
  await startCampaignExecution(seeded.campaignId, seeded.creatorId, businessTime);
  let calls = 0;
  const result = await runCampaignWorkerBatch({
    now: businessTime,
    sender: async (input) => {
      calls += 1;
      assert.equal(input.to, '5492918888888');
      return {
        statusCode: 201,
        payload: {
          messageId: null,
          wamid: 'wamid-prueba',
          to: input.to,
          templateName: input.templateName,
          languageCode: input.languageCode,
          status: 'PENDING'
        }
      };
    }
  });
  assert.deepEqual(result, { claimed: 1, sent: 1, skipped: 0, failed: 0, unknown: 0 });
  assert.equal(calls, 1);
  assert.equal((await getCampaignById(seeded.campaignId)).status, 'COMPLETED');

  const second = await runCampaignWorkerBatch({ now: businessTime, sender: async () => {
    throw new Error('No debe reenviar');
  } });
  assert.equal(second.claimed, 0);
});

test('revalida la baja justo antes de enviar', async () => {
  const seeded = await seed();
  await approveCampaignExecution(seeded.campaignId, seeded.approverId);
  await startCampaignExecution(seeded.campaignId, seeded.creatorId, businessTime);
  await base.consultar(
    `UPDATE contacts SET consent_status = 'REVOKED', opt_out_at = NOW()
     WHERE id = $1`,
    [seeded.contactId]
  );
  let calls = 0;
  const result = await runCampaignWorkerBatch({
    now: businessTime,
    sender: async () => {
      calls += 1;
      throw new Error('No debe enviar a un contacto con baja');
    }
  });
  assert.equal(result.skipped, 1);
  assert.equal(calls, 0);
  assert.equal((await getCampaignById(seeded.campaignId)).status, 'COMPLETED');
});

test('un resultado ambiguo queda UNKNOWN y nunca se reintenta', async () => {
  const seeded = await seed();
  await approveCampaignExecution(seeded.campaignId, seeded.approverId);
  await startCampaignExecution(seeded.campaignId, seeded.creatorId, businessTime);
  let calls = 0;
  const sender = async () => {
    calls += 1;
    return {
      statusCode: 202 as const,
      payload: {
        messageId: null,
        wamid: null,
        to: '5492918888888',
        templateName: 'campania_ejecucion',
        languageCode: 'es_AR',
        status: 'UNKNOWN' as const,
        retrySafe: false as const,
        warning: 'Resultado ambiguo'
      }
    };
  };
  const first = await runCampaignWorkerBatch({ now: businessTime, sender });
  const second = await runCampaignWorkerBatch({ now: businessTime, sender });
  assert.equal(first.unknown, 1);
  assert.equal(second.claimed, 0);
  assert.equal(calls, 1);
  assert.equal((await getCampaignById(seeded.campaignId)).status, 'COMPLETED_WITH_ERRORS');
});
