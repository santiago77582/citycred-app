import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { applyTestEnv, TEST_API_KEY } from './helpers/entornoPruebas.js';
import { prepararBaseEnMemoria } from './helpers/baseEnMemoria.js';
import { iniciarServidorDePruebas } from './helpers/servidorHttp.js';

applyTestEnv();
const base = await prepararBaseEnMemoria();
const { syncWhatsappTemplates } = await import('../templateRepository.js');
const server = await iniciarServidorDePruebas();

test.after(async () => server.cerrar());
test.afterEach(() => base.reiniciar());

async function seed(): Promise<string> {
  await syncWhatsappTemplates([
    {
      metaTemplateId: 'meta-http-campaign',
      name: 'campania_http',
      languageCode: 'es_AR',
      category: 'MARKETING',
      status: 'APPROVED',
      components: [{ type: 'BODY', text: 'Hola' }],
      rejectionReason: null
    }
  ]);
  const template = await base.consultar(
    `SELECT id FROM whatsapp_templates WHERE name = 'campania_http'`
  );
  await base.consultar(
    `INSERT INTO contacts (
       id, wa_id, phone, profile_name, entity, commercial_status, consent_status
     ) VALUES ($1, $2, $2, $3, $4, 'INTERESTED', 'GRANTED')`,
    [randomUUID(), '5492917777777', 'Cliente API', 'Educación RN']
  );
  return String(template.rows[0]?.id);
}

function headers(): Record<string, string> {
  return { 'content-type': 'application/json', 'x-api-key': TEST_API_KEY };
}

test('la API requiere autenticación y declara ejecución desactivada', async () => {
  const unauthorized = await fetch(`${server.baseUrl}/api/v1/campaigns`);
  assert.equal(unauthorized.status, 401);

  const authorized = await fetch(`${server.baseUrl}/api/v1/campaigns`, {
    headers: { 'x-api-key': TEST_API_KEY }
  });
  assert.equal(authorized.status, 200);
  const body = await authorized.json() as {
    executionEnabled?: boolean;
    campaigns?: unknown[];
  };
  assert.equal(body.executionEnabled, false);
  assert.deepEqual(body.campaigns, []);
});

test('crea un borrador y genera vista previa sin enviar mensajes', async () => {
  const templateId = await seed();
  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(server.baseUrl)) return originalFetch(input, init);
    externalCalls += 1;
    throw new Error('No debía llamar a servicios externos');
  };

  try {
    const created = await fetch(`${server.baseUrl}/api/v1/campaigns`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        name: 'Campaña API segura',
        templateId,
        audienceFilter: { search: 'Cliente API' }
      })
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json() as {
      executionEnabled?: boolean;
      campaign?: { id?: string; status?: string };
    };
    assert.equal(createdBody.executionEnabled, false);
    assert.equal(createdBody.campaign?.status, 'DRAFT');
    const campaignId = String(createdBody.campaign?.id);

    const previewed = await fetch(
      `${server.baseUrl}/api/v1/campaigns/${campaignId}/preview`,
      { method: 'POST', headers: headers(), body: '{}' }
    );
    assert.equal(previewed.status, 200);
    const previewBody = await previewed.json() as {
      executionEnabled?: boolean;
      preview?: { candidateCount?: number; eligibleCount?: number };
    };
    assert.equal(previewBody.executionEnabled, false);
    assert.equal(previewBody.preview?.candidateCount, 1);
    assert.equal(previewBody.preview?.eligibleCount, 1);
    assert.equal(externalCalls, 0);

    const executionRequiresNamedPanelUser = await fetch(
      `${server.baseUrl}/api/v1/campaigns/${campaignId}/execute`,
      { method: 'POST', headers: headers(), body: JSON.stringify({ confirmation: 'ENVIAR' }) }
    );
    assert.equal(executionRequiresNamedPanelUser.status, 403);
    assert.equal(externalCalls, 0);

    const messageCount = await base.consultar('SELECT COUNT(*)::int AS total FROM messages');
    assert.equal(Number(messageCount.rows[0]?.total), 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
