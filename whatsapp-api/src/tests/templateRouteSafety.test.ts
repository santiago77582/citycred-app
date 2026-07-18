import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTestEnv, TEST_API_KEY } from './helpers/entornoPruebas.js';
import { prepararBaseEnMemoria } from './helpers/baseEnMemoria.js';
import { iniciarServidorDePruebas } from './helpers/servidorHttp.js';

applyTestEnv();
const base = await prepararBaseEnMemoria();
const server = await iniciarServidorDePruebas();
const { syncWhatsappTemplates } = await import('../templateRepository.js');

test.after(async () => server.cerrar());
test.afterEach(() => base.reiniciar());

function request(body: Record<string, unknown>): Promise<Response> {
  return fetch(`${server.baseUrl}/api/v1/messages/template`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': TEST_API_KEY },
    body: JSON.stringify(body)
  });
}

test('rechaza una plantilla que no está sincronizada sin contactar a Meta', async () => {
  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(server.baseUrl)) return originalFetch(input, init);
    externalCalls += 1;
    throw new Error('No debía contactar a Meta');
  };
  try {
    const response = await request({
      to: '5492911111111',
      templateName: 'plantilla_inventada',
      languageCode: 'es_AR'
    });
    assert.equal(response.status, 404);
    assert.equal(externalCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rechaza una plantilla pendiente sin contactar a Meta', async () => {
  await syncWhatsappTemplates([{
    metaTemplateId: 'pending-template',
    name: 'pendiente',
    languageCode: 'es_AR',
    category: 'UTILITY',
    status: 'PENDING',
    components: [],
    rejectionReason: null
  }]);

  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(server.baseUrl)) return originalFetch(input, init);
    externalCalls += 1;
    throw new Error('No debía contactar a Meta');
  };
  try {
    const response = await request({
      to: '5492911111111',
      templateName: 'pendiente',
      languageCode: 'es_AR'
    });
    assert.equal(response.status, 409);
    assert.equal(externalCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
