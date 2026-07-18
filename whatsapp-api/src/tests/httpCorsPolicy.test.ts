import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTestEnv } from './helpers/entornoPruebas.js';
import { prepararBaseEnMemoria } from './helpers/baseEnMemoria.js';
import { iniciarServidorDePruebas } from './helpers/servidorHttp.js';

applyTestEnv({ CORS_ORIGINS: 'https://permitido.example' });
const base = await prepararBaseEnMemoria();
const server = await iniciarServidorDePruebas();

test.after(async () => server.cerrar());
test.afterEach(() => base.reiniciar());

test('autoriza únicamente el origen web configurado', async () => {
  const allowed = await fetch(`${server.baseUrl}/health`, {
    headers: { Origin: 'https://permitido.example' }
  });
  assert.equal(allowed.status, 200);
  assert.equal(
    allowed.headers.get('access-control-allow-origin'),
    'https://permitido.example'
  );

  const denied = await fetch(`${server.baseUrl}/health`, {
    headers: { Origin: 'https://no-permitido.example' }
  });
  assert.equal(denied.status, 200);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
});

test('las llamadas servidor a servidor sin Origin continúan funcionando', async () => {
  const response = await fetch(`${server.baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});
