import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTestEnv, TEST_API_KEY } from './helpers/entornoPruebas.js';
import { prepararBaseEnMemoria } from './helpers/baseEnMemoria.js';
import { iniciarServidorDePruebas } from './helpers/servidorHttp.js';

applyTestEnv({
  META_GRAPH_VERSION: 'v23.0',
  WHATSAPP_ACCESS_TOKEN: 'token-analytics-pruebas',
  WHATSAPP_PHONE_NUMBER_ID: '123456789',
  WHATSAPP_BUSINESS_ACCOUNT_ID: '987654321'
});

const base = await prepararBaseEnMemoria();
const server = await iniciarServidorDePruebas();

test.after(async () => server.cerrar());
test.afterEach(() => base.reiniciar());

async function api(path: string): Promise<Response> {
  return fetch(`${server.baseUrl}/api/v1/meta-analytics${path}`, {
    headers: { 'x-api-key': TEST_API_KEY }
  });
}

test('informa capacidades sin inventar costos ni contactar a Meta', async () => {
  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(server.baseUrl)) return originalFetch(input, init);
    externalCalls += 1;
    throw new Error('No debía consultar Meta');
  };

  try {
    const response = await api('/capabilities');
    assert.equal(response.status, 200);
    const body = await response.json() as {
      source: string;
      costPolicy: {
        estimatesGenerated: boolean;
        valuesReturnedOnlyWhenProvidedByMeta: boolean;
      };
    };
    assert.equal(body.source, 'META_OFFICIAL');
    assert.equal(body.costPolicy.estimatesGenerated, false);
    assert.equal(body.costPolicy.valuesReturnedOnlyWhenProvidedByMeta, true);
    assert.equal(externalCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('consulta estado oficial de la WABA con moneda y referencia de pago', async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(server.baseUrl)) return originalFetch(input, init);
    urls.push(url);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('authorization'), 'Bearer token-analytics-pruebas');
    return new Response(JSON.stringify({
      id: '987654321',
      name: 'CityCred',
      currency: 'USD',
      account_review_status: 'APPROVED',
      primary_funding_id: 'funding-1'
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const response = await api('/waba');
    assert.equal(response.status, 200);
    assert.equal(urls.length, 1);
    const url = new URL(urls[0] ?? '');
    assert.match(url.pathname, /\/v23\.0\/987654321$/);
    const fields = url.searchParams.get('fields') ?? '';
    assert.match(fields, /account_review_status/);
    assert.match(fields, /currency/);
    assert.match(fields, /primary_funding_id/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('construye la consulta oficial de mensajes con filtros validados', async () => {
  const originalFetch = globalThis.fetch;
  let externalUrl = '';
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(server.baseUrl)) return originalFetch(input, init);
    externalUrl = url;
    return new Response(JSON.stringify({ analytics: { data: [] } }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const params = new URLSearchParams({
      start: '2026-07-01T00:00:00.000Z',
      end: '2026-07-18T00:00:00.000Z',
      phoneNumbers: '5492914717121,5492914717121',
      countryCodes: 'ar,US'
    });
    const response = await api(`/messages?${params}`);
    assert.equal(response.status, 200);
    const fields = new URL(externalUrl).searchParams.get('fields') ?? '';
    assert.match(fields, /^analytics\.start\(/);
    assert.match(fields, /\.granularity\(DAY\)/);
    assert.match(fields, /\.phone_numbers\(\["5492914717121"\]\)/);
    assert.match(fields, /\.country_codes\(\["AR","US"\]\)/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('construye analíticas de conversaciones por dirección y dimensión', async () => {
  const originalFetch = globalThis.fetch;
  let externalUrl = '';
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(server.baseUrl)) return originalFetch(input, init);
    externalUrl = url;
    return new Response(JSON.stringify({ conversation_analytics: { data: [] } }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const params = new URLSearchParams({
      start: '2026-01-01T00:00:00.000Z',
      end: '2026-07-01T00:00:00.000Z',
      directions: 'business_initiated,user_initiated',
      dimensions: 'conversation_type,country'
    });
    const response = await api(`/conversations?${params}`);
    assert.equal(response.status, 200);
    const fields = new URL(externalUrl).searchParams.get('fields') ?? '';
    assert.match(fields, /^conversation_analytics\.start\(/);
    assert.match(fields, /\.granularity\(MONTHLY\)/);
    assert.match(fields, /\.conversation_directions\(\["business_initiated","user_initiated"\]\)/);
    assert.match(fields, /\.dimensions\(\["conversation_type","country"\]\)/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('consulta métricas oficiales de un Flow', async () => {
  const originalFetch = globalThis.fetch;
  let externalUrl = '';
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(server.baseUrl)) return originalFetch(input, init);
    externalUrl = url;
    return new Response(JSON.stringify({ metric: { data: [] } }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const response = await api(
      '/flows/flow-1/metric?name=ENDPOINT_AVAILABILITY&since=2026-07-01&until=2026-07-18'
    );
    assert.equal(response.status, 200);
    const url = new URL(externalUrl);
    assert.match(url.pathname, /\/v23\.0\/flow-1$/);
    assert.equal(
      url.searchParams.get('fields'),
      'metric.name(ENDPOINT_AVAILABILITY).granularity(DAY).since(2026-07-01).until(2026-07-18)'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rechaza rangos y filtros inválidos antes de consultar Meta', async () => {
  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(server.baseUrl)) return originalFetch(input, init);
    externalCalls += 1;
    throw new Error('No debía consultar Meta');
  };

  try {
    const longRange = new URLSearchParams({
      start: '2024-01-01T00:00:00.000Z',
      end: '2026-07-18T00:00:00.000Z'
    });
    assert.equal((await api(`/messages?${longRange}`)).status, 400);

    const badPhone = new URLSearchParams({
      start: '2026-07-01T00:00:00.000Z',
      end: '2026-07-18T00:00:00.000Z',
      phoneNumbers: 'no-es-un-numero'
    });
    assert.equal((await api(`/messages?${badPhone}`)).status, 400);

    assert.equal(
      (await api('/flows/flow-1/metric?name=ENDPOINT_AVAILABILITY&since=2026-07-18&until=2026-07-01')).status,
      400
    );
    assert.equal(externalCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
