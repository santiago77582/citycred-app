import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTestEnv, TEST_API_KEY } from './helpers/entornoPruebas.js';
import { prepararBaseEnMemoria } from './helpers/baseEnMemoria.js';
import { iniciarServidorDePruebas } from './helpers/servidorHttp.js';

applyTestEnv({
  META_GRAPH_VERSION: 'v23.0',
  WHATSAPP_ACCESS_TOKEN: 'token-flows-pruebas',
  WHATSAPP_PHONE_NUMBER_ID: '123456789',
  WHATSAPP_BUSINESS_ACCOUNT_ID: '987654321'
});

const base = await prepararBaseEnMemoria();
const server = await iniciarServidorDePruebas();
const { buildFlowMessage } = await import('../routes/flows.js');

test.after(async () => server.cerrar());
test.afterEach(() => base.reiniciar());

async function api(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${server.baseUrl}/api/v1${path}`, {
    ...options,
    headers: {
      'x-api-key': TEST_API_KEY,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers ?? {})
    }
  });
}

test('lista Flows recorriendo todas las páginas', async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(server.baseUrl)) return originalFetch(input, init);
    urls.push(url);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('authorization'), 'Bearer token-flows-pruebas');
    if (urls.length === 1) {
      return new Response(JSON.stringify({
        data: [{ id: 'flow-1', name: 'Formulario uno', status: 'DRAFT' }],
        paging: { cursors: { after: 'segunda-pagina' } }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      data: [{ id: 'flow-2', name: 'Formulario dos', status: 'PUBLISHED' }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const response = await api('/flows');
    assert.equal(response.status, 200);
    const body = await response.json() as { flows: Array<{ id: string }> };
    assert.deepEqual(body.flows.map((flow) => flow.id), ['flow-1', 'flow-2']);
    assert.match(urls[0] ?? '', /987654321\/flows/);
    assert.match(urls[1] ?? '', /after=segunda-pagina/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('crea un Flow y carga el JSON oficial como archivo', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(server.baseUrl)) return originalFetch(input, init);
    calls.push({ url, method: String(init?.method ?? 'GET'), body: init?.body });
    if (url.endsWith('/assets')) {
      return new Response(JSON.stringify({ success: true, validation_errors: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ id: 'flow-creado' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const created = await api('/flows', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Precalificación CityCred',
        categories: ['LEAD_GENERATION'],
        endpointUri: 'https://example.com/flows'
      })
    });
    assert.equal(created.status, 201);

    const uploaded = await api('/flows/flow-creado/json', {
      method: 'PUT',
      body: JSON.stringify({
        flowJson: {
          version: '7.1',
          screens: [{ id: 'INICIO', title: 'Inicio', terminal: true, layout: { type: 'SingleColumnLayout', children: [] } }]
        }
      })
    });
    assert.equal(uploaded.status, 200);
    assert.equal(calls.length, 2);
    assert.ok(calls[0]?.body instanceof FormData);
    assert.ok(calls[1]?.body instanceof FormData);
    const uploadForm = calls[1]?.body as FormData;
    assert.equal(uploadForm.get('asset_type'), 'FLOW_JSON');
    assert.equal(uploadForm.get('name'), 'flow.json');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('exige confirmación antes de publicar retirar o borrar', async () => {
  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(server.baseUrl)) return originalFetch(input, init);
    externalCalls += 1;
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    for (const operation of [
      { path: '/flows/flow-1/publish', method: 'POST' },
      { path: '/flows/flow-1/deprecate', method: 'POST' },
      { path: '/flows/flow-1', method: 'DELETE' }
    ]) {
      const denied = await api(operation.path, {
        method: operation.method,
        body: JSON.stringify({})
      });
      assert.equal(denied.status, 400);
    }
    assert.equal(externalCalls, 0);

    const accepted = await api('/flows/flow-1/publish', {
      method: 'POST',
      body: JSON.stringify({ confirm: true })
    });
    assert.equal(accepted.status, 200);
    assert.equal(externalCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('envía un Flow publicado y guarda el mensaje', async () => {
  const originalFetch = globalThis.fetch;
  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(server.baseUrl)) return originalFetch(input, init);
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify({ messages: [{ id: 'wamid-flow-1' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const response = await api('/flows/send/message', {
      method: 'POST',
      body: JSON.stringify({
        to: '5492911111111',
        flowId: 'flow-1',
        flowToken: 'seguimiento-cliente-1',
        cta: 'Completar datos',
        header: 'CityCred',
        body: 'Completá la precalificación',
        footer: 'Tus datos serán revisados',
        screen: 'INICIO',
        data: { cliente: 'Juan' }
      })
    });
    assert.equal(response.status, 201);
    assert.equal(bodies.length, 1);
    const body = bodies[0];
    assert.ok(body);
    const interactive = body.interactive as Record<string, unknown>;
    assert.equal(interactive.type, 'flow');
    const action = interactive.action as Record<string, unknown>;
    const parameters = action.parameters as Record<string, unknown>;
    assert.equal(parameters.flow_message_version, '3');
    assert.equal(parameters.flow_id, 'flow-1');
    assert.equal(parameters.flow_token, 'seguimiento-cliente-1');

    const saved = await base.consultar(
      `SELECT type, status FROM messages WHERE wamid = 'wamid-flow-1'`
    );
    assert.equal(saved.rows[0]?.type, 'flow');
    assert.equal(saved.rows[0]?.status, 'PENDING');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('construye un Flow de borrador únicamente cuando se solicita', () => {
  const draft = buildFlowMessage({
    to: '5492911111111',
    flowId: 'flow-1',
    flowToken: 'token-1',
    cta: 'Abrir',
    body: 'Formulario',
    mode: 'draft'
  });
  const interactive = draft.interactive as Record<string, unknown>;
  const action = interactive.action as Record<string, unknown>;
  const parameters = action.parameters as Record<string, unknown>;
  assert.equal(parameters.mode, 'draft');
});
