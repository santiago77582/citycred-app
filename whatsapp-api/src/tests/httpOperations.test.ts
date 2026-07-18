import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTestEnv, TEST_API_KEY } from './helpers/entornoPruebas.js';
import { prepararBaseEnMemoria } from './helpers/baseEnMemoria.js';
import { iniciarServidorDePruebas } from './helpers/servidorHttp.js';

applyTestEnv();
const base = await prepararBaseEnMemoria();
const server = await iniciarServidorDePruebas();

test.after(async () => server.cerrar());
test.afterEach(() => base.reiniciar());

test('el monitor está montado en la aplicación real y exige API key', async () => {
  const denied = await fetch(`${server.baseUrl}/api/v1/operations/overview`);
  assert.equal(denied.status, 401);

  const allowed = await fetch(`${server.baseUrl}/api/v1/operations/overview`, {
    headers: { 'x-api-key': TEST_API_KEY }
  });
  assert.equal(allowed.status, 200);
  const body = await allowed.json() as { latestRun: unknown; alerts: unknown[] };
  assert.equal(body.latestRun, null);
  assert.deepEqual(body.alerts, []);
});

test('ejecuta una verificación manual por la ruta protegida', async () => {
  const response = await fetch(`${server.baseUrl}/api/v1/operations/check`, {
    method: 'POST',
    headers: { 'x-api-key': TEST_API_KEY }
  });
  assert.equal(response.status, 201);
  const body = await response.json() as {
    run: { status: string; checks: Array<{ key: string }> };
  };
  assert.ok(['SUCCESS', 'WARNING'].includes(body.run.status));
  assert.ok(body.run.checks.some((check) => check.key === 'database'));
  assert.ok(body.run.checks.some((check) => check.key === 'campaign_safety'));
});
