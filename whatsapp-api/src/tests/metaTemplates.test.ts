import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTestEnv } from './helpers/entornoPruebas.js';

applyTestEnv({
  META_GRAPH_VERSION: 'v23.0',
  WHATSAPP_ACCESS_TOKEN: 'token-plantillas-pruebas',
  WHATSAPP_PHONE_NUMBER_ID: '123456789',
  WHATSAPP_BUSINESS_ACCOUNT_ID: '987654321',
  META_MAX_RETRIES: '1',
  META_RETRY_BASE_MS: '50'
});

const { fetchAllMetaTemplates } = await import('../services/metaTemplates.js');

test('recorre las páginas y normaliza plantillas sin duplicarlas', async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    urls.push(url);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('authorization'), 'Bearer token-plantillas-pruebas');
    assert.equal(init?.method, 'GET');
    assert.equal(init?.redirect, 'error');

    if (urls.length === 1) {
      return new Response(JSON.stringify({
        data: [
          {
            id: 'tpl-1',
            name: 'bienvenida',
            language: 'es_AR',
            status: 'APPROVED',
            category: 'UTILITY',
            components: [{ type: 'BODY', text: 'Hola {{1}}' }]
          }
        ],
        paging: { cursors: { after: 'cursor-segunda-pagina' } }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      data: [
        {
          id: 'tpl-1-duplicada',
          name: 'bienvenida',
          language: 'es_AR',
          status: 'APPROVED'
        },
        {
          id: 'tpl-2',
          name: 'documentacion_pendiente',
          language: 'es_AR',
          status: 'PENDING',
          category: 'UTILITY',
          rejected_reason: ''
        },
        { id: null, name: 'invalida', language: 'es_AR', status: 'APPROVED' }
      ]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const templates = await fetchAllMetaTemplates();
    assert.equal(templates.length, 2);
    assert.equal(templates[0]?.name, 'bienvenida');
    assert.equal(templates[0]?.status, 'APPROVED');
    assert.equal(templates[1]?.name, 'documentacion_pendiente');
    assert.equal(templates[1]?.status, 'PENDING');
    assert.match(urls[0] ?? '', /987654321\/message_templates/);
    assert.match(urls[0] ?? '', /fields=/);
    assert.match(urls[1] ?? '', /after=cursor-segunda-pagina/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('reintenta la consulta GET ante una falla transitoria', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({ error: { message: 'temporal' } }), {
        status: 503,
        headers: { 'content-type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    assert.deepEqual(await fetchAllMetaTemplates(), []);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
