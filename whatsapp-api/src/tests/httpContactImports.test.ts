import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTestEnv, TEST_ADMIN_PASSWORD } from './helpers/entornoPruebas.js';
import { prepararBaseEnMemoria } from './helpers/baseEnMemoria.js';
import { iniciarServidorDePruebas } from './helpers/servidorHttp.js';

applyTestEnv();
const base = await prepararBaseEnMemoria();
const server = await iniciarServidorDePruebas();
const { createUser } = await import('../crm/teamRepository.js');

test.after(async () => server.cerrar());
test.afterEach(() => base.reiniciar());

async function login(email: string | null, password: string): Promise<string> {
  const form = new URLSearchParams({ password });
  if (email) form.set('email', email);
  const response = await fetch(`${server.baseUrl}/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
    redirect: 'manual'
  });
  assert.equal(response.status, 303);
  return (response.headers.get('set-cookie') ?? '').split(';', 1)[0] ?? '';
}

function csvRequest(cookie: string): RequestInit {
  return {
    method: 'POST',
    headers: {
      cookie,
      'content-type': 'text/csv',
      'x-file-name': 'clientes.csv'
    },
    body: Buffer.from([
      'telefono,nombre,consentimiento,fecha consentimiento',
      '0291 555-9999,Cliente HTTP,OTORGADO,2026-07-01'
    ].join('\n'))
  };
}

test('rechaza importaciones sin sesión individual', async () => {
  const emergencyCookie = await login(null, TEST_ADMIN_PASSWORD);
  const denied = await fetch(
    `${server.baseUrl}/admin/api/imports/preview`,
    csvRequest(emergencyCookie)
  );
  assert.equal(denied.status, 403);
});

test('la API separa vista previa y confirmación de importación', async () => {
  await createUser({
    email: 'supervisor-import@citycred.test',
    displayName: 'Supervisor Import',
    password: 'ClaveSupervisor123!',
    role: 'SUPERVISOR'
  });
  const cookie = await login('supervisor-import@citycred.test', 'ClaveSupervisor123!');
  const previewed = await fetch(
    `${server.baseUrl}/admin/api/imports/preview`,
    csvRequest(cookie)
  );
  assert.equal(previewed.status, 201);
  const previewBody = await previewed.json() as {
    batch?: { id?: string; status?: string; validRows?: number };
  };
  assert.equal(previewBody.batch?.status, 'PREVIEWED');
  assert.equal(previewBody.batch?.validRows, 1);
  assert.equal(Number((await base.consultar('SELECT COUNT(*) AS total FROM contacts')).rows[0]?.total), 0);
  const batchId = String(previewBody.batch?.id);

  const missingConfirmation = await fetch(
    `${server.baseUrl}/admin/api/imports/${batchId}/commit`,
    {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: '{}'
    }
  );
  assert.equal(missingConfirmation.status, 400);
  assert.equal(Number((await base.consultar('SELECT COUNT(*) AS total FROM contacts')).rows[0]?.total), 0);

  const committed = await fetch(
    `${server.baseUrl}/admin/api/imports/${batchId}/commit`,
    {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: 'IMPORTAR' })
    }
  );
  assert.equal(committed.status, 200);
  const contact = await base.consultar(
    `SELECT wa_id, consent_status FROM contacts WHERE wa_id = '5492915559999'`
  );
  assert.equal(contact.rows[0]?.consent_status, 'GRANTED');
});
