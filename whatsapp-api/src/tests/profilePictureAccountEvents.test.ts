import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyTestEnv,
  TEST_API_KEY,
  TEST_META_APP_SECRET
} from './helpers/entornoPruebas.js';
import { prepararBaseEnMemoria } from './helpers/baseEnMemoria.js';
import {
  firmaDeMeta,
  iniciarServidorDePruebas,
  postWebhook
} from './helpers/servidorHttp.js';

applyTestEnv({
  META_APP_ID: 'app-id-pruebas',
  META_GRAPH_VERSION: 'v23.0',
  WHATSAPP_ACCESS_TOKEN: 'token-perfil-pruebas',
  WHATSAPP_PHONE_NUMBER_ID: '123456789',
  WHATSAPP_BUSINESS_ACCOUNT_ID: '987654321'
});

const base = await prepararBaseEnMemoria();
const server = await iniciarServidorDePruebas();
const { syncWhatsappTemplates } = await import('../templateRepository.js');

test.after(async () => server.cerrar());
test.afterEach(() => base.reiniciar());

async function account(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${server.baseUrl}/api/v1/account${path}`, {
    ...options,
    headers: {
      'x-api-key': TEST_API_KEY,
      ...(options.headers ?? {})
    }
  });
}

async function webhook(payload: unknown): Promise<Response> {
  const body = JSON.stringify(payload);
  return postWebhook(server.baseUrl, body, firmaDeMeta(body, TEST_META_APP_SECRET));
}

test('carga una foto por sesión reanudable y aplica el handle al perfil', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; headers: Headers; body: BodyInit | null | undefined }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(server.baseUrl)) return originalFetch(input, init);
    const headers = new Headers(init?.headers);
    calls.push({ url, method: String(init?.method ?? 'GET'), headers, body: init?.body });
    if (url.includes('/app-id-pruebas/uploads')) {
      return new Response(JSON.stringify({ id: 'upload:sesion-prueba' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (url.includes('/upload:sesion-prueba')) {
      return new Response(JSON.stringify({ h: 'handle-foto-prueba' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const picture = new Uint8Array([255, 216, 255, 217]);
    const response = await account('/profile-picture?confirm=true', {
      method: 'POST',
      headers: { 'content-type': 'image/jpeg' },
      body: picture
    });
    assert.equal(response.status, 200);
    assert.equal(calls.length, 3);

    const sessionUrl = new URL(calls[0]?.url ?? '');
    assert.match(sessionUrl.pathname, /\/v23\.0\/app-id-pruebas\/uploads$/);
    assert.equal(sessionUrl.searchParams.get('file_length'), '4');
    assert.equal(sessionUrl.searchParams.get('file_type'), 'image/jpeg');

    assert.equal(calls[1]?.headers.get('file_offset'), '0');
    assert.equal(calls[1]?.headers.get('content-type'), 'image/jpeg');

    const profileBody = JSON.parse(String(calls[2]?.body)) as Record<string, unknown>;
    assert.equal(profileBody.messaging_product, 'whatsapp');
    assert.equal(profileBody.profile_picture_handle, 'handle-foto-prueba');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rechaza foto sin confirmación antes de contactar a Meta', async () => {
  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(server.baseUrl)) return originalFetch(input, init);
    externalCalls += 1;
    throw new Error('No debía contactar a Meta');
  };

  try {
    const response = await account('/profile-picture', {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: new Uint8Array([1, 2, 3])
    });
    assert.equal(response.status, 400);
    assert.equal(externalCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('normaliza calidad y límite sin duplicar el reintento del webhook', async () => {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: '987654321',
      time: 1784415600,
      changes: [{
        field: 'phone_number_quality_update',
        value: {
          display_phone_number: '5492914717121',
          event: 'UPGRADE',
          current_limit: 'TIER_10K'
        }
      }]
    }]
  };

  assert.equal((await webhook(payload)).status, 200);
  assert.equal((await webhook(payload)).status, 200);

  const rows = await base.consultar(
    `SELECT field, event, display_phone_number, current_limit
     FROM meta_account_events`
  );
  assert.equal(rows.rows.length, 1);
  assert.equal(rows.rows[0]?.field, 'phone_number_quality_update');
  assert.equal(rows.rows[0]?.event, 'UPGRADE');
  assert.equal(rows.rows[0]?.display_phone_number, '5492914717121');
  assert.equal(rows.rows[0]?.current_limit, 'TIER_10K');

  const state = await account('/state');
  assert.equal(state.status, 200);
  const body = await state.json() as {
    state: { quality: { currentLimit: string; event: string } | null };
  };
  assert.equal(body.state.quality?.currentLimit, 'TIER_10K');
  assert.equal(body.state.quality?.event, 'UPGRADE');
});

test('actualiza una plantilla sincronizada ante el webhook de Meta', async () => {
  await syncWhatsappTemplates([{
    metaTemplateId: 'template-meta-1',
    name: 'seguimiento_citycred',
    languageCode: 'es_AR',
    category: 'UTILITY',
    status: 'PENDING',
    components: [],
    rejectionReason: null
  }]);

  const payload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: '987654321',
      time: 1784415601,
      changes: [{
        field: 'message_template_status_update',
        value: {
          message_template_id: 'template-meta-1',
          message_template_name: 'seguimiento_citycred',
          message_template_language: 'es_AR',
          event: 'APPROVED'
        }
      }]
    }]
  };

  assert.equal((await webhook(payload)).status, 200);
  const template = await base.consultar(
    `SELECT status FROM whatsapp_templates WHERE meta_template_id = 'template-meta-1'`
  );
  assert.equal(template.rows[0]?.status, 'APPROVED');

  const events = await account('/events?field=message_template_status_update');
  assert.equal(events.status, 200);
  const body = await events.json() as { events: Array<{ event: string }> };
  assert.equal(body.events[0]?.event, 'APPROVED');
});
