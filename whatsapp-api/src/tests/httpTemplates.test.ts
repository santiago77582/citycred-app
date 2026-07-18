import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyTestEnv,
  TEST_API_KEY
} from './helpers/entornoPruebas.js';
import { prepararBaseEnMemoria } from './helpers/baseEnMemoria.js';
import { iniciarServidorDePruebas } from './helpers/servidorHttp.js';

applyTestEnv({
  META_GRAPH_VERSION: 'v23.0',
  WHATSAPP_ACCESS_TOKEN: 'token-plantillas-http',
  WHATSAPP_PHONE_NUMBER_ID: '123456789',
  WHATSAPP_BUSINESS_ACCOUNT_ID: '987654321'
});
const base = await prepararBaseEnMemoria();
const { syncWhatsappTemplates } = await import('../templateRepository.js');
const server = await iniciarServidorDePruebas();

test.after(async () => server.cerrar());
test.afterEach(() => base.reiniciar());

async function seedTemplates() {
  await syncWhatsappTemplates([
    {
      metaTemplateId: 'meta-approved',
      name: 'bienvenida_aprobada',
      languageCode: 'es_AR',
      category: 'UTILITY',
      status: 'APPROVED',
      components: [{ type: 'BODY', text: 'Hola {{1}}' }],
      rejectionReason: null
    },
    {
      metaTemplateId: 'meta-pending',
      name: 'pendiente_revision',
      languageCode: 'es_AR',
      category: 'MARKETING',
      status: 'PENDING',
      components: [],
      rejectionReason: null
    }
  ]);
  const result = await base.consultar(
    'SELECT id, name FROM whatsapp_templates ORDER BY name'
  );
  return Object.fromEntries(result.rows.map((row) => [String(row.name), String(row.id)]));
}

test('la lista de plantillas requiere clave de API', async () => {
  const response = await fetch(`${server.baseUrl}/api/v1/templates`);
  assert.equal(response.status, 401);
});

test('rechaza el envío de una plantilla que no está aprobada sin llamar a Meta', async () => {
  const ids = await seedTemplates();
  const originalFetch = globalThis.fetch;
  let metaCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(server.baseUrl)) return originalFetch(input, init);
    metaCalls += 1;
    throw new Error('No debía llamar a Meta');
  };

  try {
    const response = await fetch(
      `${server.baseUrl}/api/v1/templates/${ids.pendiente_revision}/send`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': TEST_API_KEY
        },
        body: JSON.stringify({ to: '5492915550000' })
      }
    );
    assert.equal(response.status, 409);
    assert.equal(metaCalls, 0);
    const body = await response.json() as { error?: string };
    assert.match(body.error ?? '', /no está aprobada/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('envía una plantilla aprobada usando el nombre e idioma sincronizados', async () => {
  const ids = await seedTemplates();
  const originalFetch = globalThis.fetch;
  let metaCalls = 0;
  const sentPayloads: Record<string, unknown>[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(server.baseUrl)) return originalFetch(input, init);
    metaCalls += 1;
    sentPayloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify({ messages: [{ id: 'wamid.template.approved' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const response = await fetch(
      `${server.baseUrl}/api/v1/templates/${ids.bienvenida_aprobada}/send`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': TEST_API_KEY
        },
        body: JSON.stringify({
          to: '5492915550000',
          components: [{
            type: 'body',
            parameters: [{ type: 'text', text: 'Santiago' }]
          }]
        })
      }
    );
    assert.equal(response.status, 201);
    assert.equal(metaCalls, 1);
    const template = sentPayloads[0]?.template as {
      name?: string;
      language?: { code?: string };
    } | undefined;
    assert.equal(template?.name, 'bienvenida_aprobada');
    assert.equal(template?.language?.code, 'es_AR');

    const body = await response.json() as {
      status?: string;
      wamid?: string;
      botPausedUntil?: string;
    };
    assert.equal(body.status, 'PENDING');
    assert.equal(body.wamid, 'wamid.template.approved');
    assert.ok(body.botPausedUntil);

    const persisted = await base.consultar(
      `SELECT type, status, text FROM messages WHERE wamid = $1`,
      ['wamid.template.approved']
    );
    assert.equal(persisted.rows[0]?.type, 'template');
    assert.equal(persisted.rows[0]?.status, 'PENDING');
    assert.equal(persisted.rows[0]?.text, 'plantilla:bienvenida_aprobada');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
