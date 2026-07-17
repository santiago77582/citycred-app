import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { applyTestEnv, TEST_ADMIN_PASSWORD } from './helpers/entornoPruebas.js';

applyTestEnv();

const { prepararBaseEnMemoria } = await import('./helpers/baseEnMemoria.js');
const { iniciarServidorDePruebas } = await import('./helpers/servidorHttp.js');
const { insertMessage, upsertContact, upsertConversation } = await import('../repository.js');

await prepararBaseEnMemoria();

let baseUrl = '';
let cerrar: () => Promise<void> = async () => {};

before(async () => {
  const servidor = await iniciarServidorDePruebas();
  baseUrl = servidor.baseUrl;
  cerrar = servidor.cerrar;
});

after(async () => {
  await cerrar();
});

async function login(): Promise<string> {
  const response = await fetch(`${baseUrl}/admin/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password: TEST_ADMIN_PASSWORD })
  });
  assert.equal(response.status, 303);
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie);
  return cookie.split(';')[0] ?? '';
}

test('redirige al login cuando no hay sesión', async () => {
  const response = await fetch(`${baseUrl}/admin`, { redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/admin/login');
});

test('rechaza una contraseña incorrecta', async () => {
  const response = await fetch(`${baseUrl}/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password: 'incorrecta-incorrecta' })
  });
  assert.equal(response.status, 401);
  assert.match(await response.text(), /Contraseña incorrecta/);
});

test('abre el panel con sesión firmada', async () => {
  const cookie = await login();
  const response = await fetch(`${baseUrl}/admin`, { headers: { cookie } });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /CityCred WhatsApp/);
});

test('lista conversaciones y permite pausar el bot', async () => {
  const waId = '5492920123456';
  const contact = await upsertContact(waId, 'Cliente Panel');
  const conversation = await upsertConversation(contact.id);
  await insertMessage({
    wamid: 'wamid-panel-1',
    conversationId: conversation.id,
    direction: 'INBOUND',
    type: 'text',
    text: 'Hola desde la prueba',
    status: 'RECEIVED',
    raw: { prueba: true }
  });

  const cookie = await login();
  const pauseResponse = await fetch(`${baseUrl}/admin/api/conversations/${waId}/pause`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ minutes: 60 })
  });
  assert.equal(pauseResponse.status, 200);
  const pauseData = await pauseResponse.json() as { botPausedUntil: string | null };
  assert.ok(pauseData.botPausedUntil);

  const listResponse = await fetch(`${baseUrl}/admin/api/conversations`, {
    headers: { cookie }
  });
  assert.equal(listResponse.status, 200);
  const listData = await listResponse.json() as {
    conversations: Array<{ waId: string; botPausedUntil: string | null }>;
  };
  const item = listData.conversations.find((conversationItem) => conversationItem.waId === waId);
  assert.ok(item);
  assert.ok(item.botPausedUntil);
});
