import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTestEnv } from './helpers/entornoPruebas.js';
import { prepararBaseEnMemoria } from './helpers/baseEnMemoria.js';
import { iniciarServidorDePruebas } from './helpers/servidorHttp.js';

applyTestEnv();
const base = await prepararBaseEnMemoria();
const server = await iniciarServidorDePruebas();
const { createUser } = await import('../crm/teamRepository.js');

test.after(async () => server.cerrar());
test.afterEach(() => base.reiniciar());

async function login(email: string, password: string): Promise<string> {
  const response = await fetch(`${server.baseUrl}/admin/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password })
  });
  assert.equal(response.status, 303);
  return (response.headers.get('set-cookie') ?? '').split(';', 1)[0] ?? '';
}

test('un administrador abre Plataforma y un asesor recibe acceso denegado', async () => {
  await createUser({
    email: 'admin-panel@citycred.test',
    displayName: 'Administrador Panel',
    password: 'ClavePanelAdmin123!',
    role: 'ADMIN'
  });
  await createUser({
    email: 'asesor-panel@citycred.test',
    displayName: 'Asesor Panel',
    password: 'ClavePanelAsesor123!',
    role: 'ADVISOR'
  });

  const adminCookie = await login('admin-panel@citycred.test', 'ClavePanelAdmin123!');
  const advisorCookie = await login('asesor-panel@citycred.test', 'ClavePanelAsesor123!');

  const adminPage = await fetch(`${server.baseUrl}/admin/platform`, {
    headers: { cookie: adminCookie }
  });
  assert.equal(adminPage.status, 200);
  assert.match(await adminPage.text(), /Estado de la plataforma/);

  const adminScript = await fetch(`${server.baseUrl}/admin/assets/platform.js`, {
    headers: { cookie: adminCookie }
  });
  assert.equal(adminScript.status, 200);
  assert.match(await adminScript.text(), /CityCredPlatform/);

  const advisorPage = await fetch(`${server.baseUrl}/admin/platform`, {
    headers: { cookie: advisorCookie }
  });
  assert.equal(advisorPage.status, 403);

  const advisorApi = await fetch(`${server.baseUrl}/admin/api/platform/bot/status`, {
    headers: { cookie: advisorCookie }
  });
  assert.equal(advisorApi.status, 403);
});
