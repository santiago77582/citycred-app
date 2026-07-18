import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { applyTestEnv, TEST_ADMIN_PASSWORD } from './helpers/entornoPruebas.js';

applyTestEnv();

const { prepararBaseEnMemoria } = await import('./helpers/baseEnMemoria.js');
const { iniciarServidorDePruebas } = await import('./helpers/servidorHttp.js');
const { upsertContact, upsertConversation } = await import('../repository.js');

const base = await prepararBaseEnMemoria();

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

test('rechaza una contraseña incorrecta sin revelar si el correo existe', async () => {
  const response = await fetch(`${baseUrl}/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password: 'incorrecta-incorrecta' })
  });
  assert.equal(response.status, 401);
  assert.match(await response.text(), /Correo o contraseña incorrectos/);
});

test('abre el panel con sesión firmada', async () => {
  const cookie = await login();
  const response = await fetch(`${baseUrl}/admin`, { headers: { cookie } });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /CityCred WhatsApp/);
});

test('lista conversaciones vacías con sesión válida', async () => {
  const cookie = await login();
  const response = await fetch(`${baseUrl}/admin/api/conversations`, {
    headers: { cookie }
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { conversations: [] });
});

test('permite pausar y reactivar el bot por conversación', async () => {
  const waId = '5492920123456';
  const contact = await upsertContact(waId, 'Cliente Panel');
  await upsertConversation(contact.id);

  const cookie = await login();
  const pauseResponse = await fetch(`${baseUrl}/admin/api/conversations/${waId}/pause`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ minutes: 60 })
  });
  assert.equal(pauseResponse.status, 200);
  const pauseData = await pauseResponse.json() as { botPausedUntil: string | null };
  assert.ok(pauseData.botPausedUntil);

  const paused = await base.consultar(
    `SELECT bot_paused_until FROM conversations c
     JOIN contacts ct ON ct.id = c.contact_id
     WHERE ct.wa_id = $1`,
    [waId]
  );
  assert.ok(paused.rows[0]?.bot_paused_until);

  const resumeResponse = await fetch(`${baseUrl}/admin/api/conversations/${waId}/pause`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ minutes: 0 })
  });
  assert.equal(resumeResponse.status, 200);
  const resumeData = await resumeResponse.json() as { botPausedUntil: string | null };
  assert.equal(resumeData.botPausedUntil, null);
});
