import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { applyTestEnv } from './helpers/entornoPruebas.js';
import { prepararBaseEnMemoria } from './helpers/baseEnMemoria.js';

applyTestEnv();
const base = await prepararBaseEnMemoria();
const {
  createCampaignDraft,
  getCampaignById,
  listCampaignRecipients,
  previewCampaign,
  updateCampaignDraft
} = await import('../campaignRepository.js');
const { syncWhatsappTemplates } = await import('../templateRepository.js');

test.afterEach(() => base.reiniciar());

async function seedTemplate(): Promise<string> {
  await syncWhatsappTemplates([
    {
      metaTemplateId: 'meta-campaign-approved',
      name: 'campania_aprobada',
      languageCode: 'es_AR',
      category: 'MARKETING',
      status: 'APPROVED',
      components: [{ type: 'BODY', text: 'Hola' }],
      rejectionReason: null
    }
  ]);
  const result = await base.consultar(
    `SELECT id FROM whatsapp_templates WHERE name = 'campania_aprobada'`
  );
  return String(result.rows[0]?.id);
}

async function insertContact(params: {
  waId: string;
  name: string;
  entity?: string;
  commercialStatus?: string;
  consentStatus?: string;
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
      params.entity ?? 'Educación RN',
      params.commercialStatus ?? 'INTERESTED',
      params.consentStatus ?? 'GRANTED',
      params.optOut ? new Date().toISOString() : null
    ]
  );
  return id;
}

test('solo habilita contactos con consentimiento y sin baja', async () => {
  const templateId = await seedTemplate();
  const eligibleId = await insertContact({
    waId: '5492911111111',
    name: 'Cliente habilitado'
  });
  await insertContact({
    waId: '5492912222222',
    name: 'Sin consentimiento',
    consentStatus: 'UNKNOWN'
  });
  await insertContact({
    waId: '5492913333333',
    name: 'No contactar',
    commercialStatus: 'DO_NOT_CONTACT'
  });
  await insertContact({
    waId: '5492914444444',
    name: 'Baja registrada',
    consentStatus: 'REVOKED',
    optOut: true
  });
  await insertContact({
    waId: '123',
    name: 'Número inválido'
  });
  await insertContact({
    waId: '5492915555555',
    name: 'Otra entidad',
    entity: 'Ejército'
  });

  const campaign = await createCampaignDraft({
    name: 'Campaña Educación julio',
    templateId,
    audienceFilter: { entities: ['Educación RN'] }
  });
  assert.equal(campaign.status, 'DRAFT');

  const preview = await previewCampaign(campaign.id);
  assert.equal(preview.candidateCount, 5);
  assert.equal(preview.eligibleCount, 1);
  assert.equal(preview.excludedCount, 4);
  assert.equal(preview.exclusionReasons.CONSENT_NOT_GRANTED, 1);
  assert.equal(preview.exclusionReasons.DO_NOT_CONTACT, 2);
  assert.equal(preview.exclusionReasons.INVALID_PHONE, 1);
  assert.equal(preview.eligibleSample[0]?.contactId, eligibleId);

  const ready = await listCampaignRecipients(campaign.id, 'READY', 100);
  const skipped = await listCampaignRecipients(campaign.id, 'SKIPPED', 100);
  assert.equal(ready.length, 1);
  assert.equal(ready[0]?.contact_id, eligibleId);
  assert.equal(skipped.length, 4);

  const stored = await getCampaignById(campaign.id);
  assert.equal(stored.status, 'PREVIEWED');
  assert.equal(stored.previewSummary.eligibleCount, 1);
  assert.ok(stored.lastPreviewedAt);
});

test('modificar el borrador borra la vista previa anterior', async () => {
  const templateId = await seedTemplate();
  await insertContact({ waId: '5492911111111', name: 'Cliente' });
  const campaign = await createCampaignDraft({
    name: 'Borrador inicial',
    templateId,
    audienceFilter: {}
  });
  await previewCampaign(campaign.id);

  const updated = await updateCampaignDraft(campaign.id, {
    name: 'Borrador corregido',
    templateId,
    audienceFilter: { commercialStatuses: ['INTERESTED'] }
  });
  assert.equal(updated.status, 'DRAFT');
  assert.equal(updated.lastPreviewedAt, null);
  assert.deepEqual(updated.previewSummary, {});
  const recipients = await listCampaignRecipients(campaign.id, undefined, 100);
  assert.equal(recipients.length, 0);
});

test('no permite crear campañas con una plantilla no aprobada', async () => {
  await syncWhatsappTemplates([
    {
      metaTemplateId: 'meta-pending-campaign',
      name: 'campania_pendiente',
      languageCode: 'es_AR',
      category: 'MARKETING',
      status: 'PENDING',
      components: [],
      rejectionReason: null
    }
  ]);
  const result = await base.consultar(
    `SELECT id FROM whatsapp_templates WHERE name = 'campania_pendiente'`
  );
  await assert.rejects(
    () => createCampaignDraft({
      name: 'Campaña inválida',
      templateId: String(result.rows[0]?.id),
      audienceFilter: {}
    }),
    /aprobada y sincronizada/i
  );
});
