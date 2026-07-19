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
  META_GRAPH_VERSION: 'v23.0',
  WHATSAPP_ACCESS_TOKEN: 'token-bot-pruebas',
  WHATSAPP_PHONE_NUMBER_ID: '123456789'
});

const base = await prepararBaseEnMemoria();
const server = await iniciarServidorDePruebas();
const { updateBotRuntimeSettings } = await import('../bot/botStateRepository.js');
const { runCitycredWorkerOnce } = await import('../bot/citycredWorker.js');

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

async function sendWebhook(message: Record<string, unknown>): Promise<Response> {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'waba-prueba',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          contacts: [{ wa_id: '5492915555555', profile: { name: 'Cliente Prueba' } }],
          messages: [message]
        }
      }]
    }]
  };
  const body = JSON.stringify(payload);
  return postWebhook(server.baseUrl, body, firmaDeMeta(body, TEST_META_APP_SECRET));
}

test('el bot y los seguimientos nacen apagados y exigen confirmación', async () => {
  const status = await api('/bot/status');
  assert.equal(status.status, 200);
  const body = await status.json() as {
    settings: { botEnabled: boolean; followupsEnabled: boolean };
  };
  assert.equal(body.settings.botEnabled, false);
  assert.equal(body.settings.followupsEnabled, false);

  const denied = await api('/bot/settings', {
    method: 'PATCH',
    body: JSON.stringify({ botEnabled: true })
  });
  assert.equal(denied.status, 400);

  const accepted = await api('/bot/settings', {
    method: 'PATCH',
    body: JSON.stringify({ confirm: true, botEnabled: true })
  });
  assert.equal(accepted.status, 200);
});

test('el webhook duplicado crea un solo mensaje y un solo trabajo', async () => {
  const message = {
    from: '5492915555555',
    id: 'wamid-bot-duplicado',
    timestamp: '1784420000',
    type: 'text',
    text: { body: 'Hola' }
  };
  assert.equal((await sendWebhook(message)).status, 200);
  assert.equal((await sendWebhook(message)).status, 200);

  const messages = await base.consultar(
    `SELECT id FROM messages WHERE wamid = 'wamid-bot-duplicado'`
  );
  const jobs = await base.consultar(
    `SELECT id FROM bot_inbound_jobs`
  );
  assert.equal(messages.rows.length, 1);
  assert.equal(jobs.rows.length, 1);
});

test('procesa la cola, envía el menú y programa cuatro seguimientos', async () => {
  await updateBotRuntimeSettings({ botEnabled: true, followupsEnabled: true });
  assert.equal((await sendWebhook({
    from: '5492915555555',
    id: 'wamid-bot-inicio',
    timestamp: '1784420001',
    type: 'text',
    text: { body: 'Hola, quiero información' }
  })).status, 200);

  const originalFetch = globalThis.fetch;
  const sentBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(server.baseUrl)) return originalFetch(input, init);
    sentBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify({ messages: [{ id: 'wamid-bot-respuesta-1' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    await runCitycredWorkerOnce();
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(sentBodies.length, 1);
  assert.equal(sentBodies[0]?.type, 'interactive');
  const interactive = sentBodies[0]?.interactive as Record<string, unknown>;
  assert.equal(interactive.type, 'list');

  const contact = await base.consultar(
    `SELECT bot_stage FROM contacts WHERE wa_id = '5492915555555'`
  );
  assert.equal(contact.rows[0]?.bot_stage, 'WAIT_ENTITY');

  const followups = await base.consultar(
    `SELECT sequence, status FROM bot_followups ORDER BY sequence`
  );
  assert.deepEqual(
    followups.rows.map((row) => [row.sequence, row.status]),
    [[1, 'PENDING'], [2, 'PENDING'], [3, 'PENDING'], [4, 'PENDING']]
  );

  const job = await base.consultar(`SELECT status FROM bot_inbound_jobs`);
  assert.equal(job.rows[0]?.status, 'DONE');
});

test('una nueva respuesta cancela el seguimiento anterior y no duplica la secuencia', async () => {
  await updateBotRuntimeSettings({ botEnabled: true, followupsEnabled: true });
  const originalFetch = globalThis.fetch;
  let outboundCounter = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(server.baseUrl)) return originalFetch(input, init);
    outboundCounter += 1;
    return new Response(JSON.stringify({ messages: [{ id: `wamid-out-${outboundCounter}` }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    await sendWebhook({
      from: '5492915555555', id: 'wamid-in-1', type: 'text', text: { body: 'Hola' }
    });
    await runCitycredWorkerOnce();
    await sendWebhook({
      from: '5492915555555',
      id: 'wamid-in-2',
      type: 'interactive',
      interactive: {
        type: 'list_reply',
        list_reply: { id: 'entity:army', title: 'Ejército' }
      }
    });
    await runCitycredWorkerOnce();
  } finally {
    globalThis.fetch = originalFetch;
  }

  const counts = await base.consultar(
    `SELECT status, COUNT(*)::int AS count
     FROM bot_followups GROUP BY status ORDER BY status`
  );
  const byStatus = Object.fromEntries(
    counts.rows.map((row) => [String(row.status), Number(row.count)])
  );
  assert.equal(byStatus.CANCELLED, 4);
  assert.equal(byStatus.PENDING, 4);

  const contact = await base.consultar(
    `SELECT bot_stage, entity FROM contacts WHERE wa_id = '5492915555555'`
  );
  assert.equal(contact.rows[0]?.bot_stage, 'WAIT_PERSONNEL_TYPE');
  assert.equal(contact.rows[0]?.entity, 'Ejército');
});

test('una conversación pausada no contacta a Meta', async () => {
  await updateBotRuntimeSettings({ botEnabled: true });
  await sendWebhook({
    from: '5492915555555', id: 'wamid-pausado', type: 'text', text: { body: 'Hola' }
  });
  await base.consultar(
    `UPDATE conversations SET bot_paused_until = NOW() + INTERVAL '1 hour'`
  );

  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(server.baseUrl)) return originalFetch(input, init);
    externalCalls += 1;
    return new Response('{}', { status: 200 });
  };
  try {
    await runCitycredWorkerOnce();
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(externalCalls, 0);
  const job = await base.consultar(`SELECT status, error_message FROM bot_inbound_jobs`);
  assert.equal(job.rows[0]?.status, 'SKIPPED');
  assert.equal(job.rows[0]?.error_message, 'conversation_paused');
});
