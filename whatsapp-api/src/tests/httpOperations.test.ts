import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import express from 'express';
import { applyTestEnv, TEST_API_KEY } from './helpers/entornoPruebas.js';
import { prepararBaseEnMemoria } from './helpers/baseEnMemoria.js';

applyTestEnv();
const base = await prepararBaseEnMemoria();
const { requireApiKey } = await import('../middleware/apiKey.js');
const { errorHandler } = await import('../middleware/errorHandler.js');
const { operationsRouter } = await import('../routes/operations.js');

const app = express();
app.use(express.json());
app.use('/api/v1/operations', requireApiKey, operationsRouter);
app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
app.use(errorHandler);
const server = http.createServer(app);
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('No se pudo iniciar el servidor de prueba');
const baseUrl = `http://127.0.0.1:${address.port}`;

test.after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});
test.afterEach(() => base.reiniciar());

function headers(): Record<string, string> {
  return { 'content-type': 'application/json', 'x-api-key': TEST_API_KEY };
}

test('requiere clave de API para consultar el estado', async () => {
  const response = await fetch(`${baseUrl}/api/v1/operations/overview`);
  assert.equal(response.status, 401);
});

test('ejecuta una verificación interna sin llamar a servicios externos', async () => {
  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(baseUrl)) return originalFetch(input, init);
    externalCalls += 1;
    throw new Error('No debía llamar a servicios externos');
  };

  try {
    const response = await fetch(`${baseUrl}/api/v1/operations/check`, {
      method: 'POST',
      headers: headers(),
      body: '{}'
    });
    assert.equal(response.status, 201);
    const body = await response.json() as {
      run?: { id?: string; status?: string; checks?: unknown[] };
    };
    assert.ok(body.run?.id);
    assert.ok(['SUCCESS', 'WARNING', 'CRITICAL'].includes(String(body.run?.status)));
    assert.ok((body.run?.checks?.length ?? 0) >= 6);
    assert.equal(externalCalls, 0);

    const overview = await fetch(`${baseUrl}/api/v1/operations/overview`, {
      headers: { 'x-api-key': TEST_API_KEY }
    });
    assert.equal(overview.status, 200);
    assert.match(overview.headers.get('cache-control') ?? '', /no-store/);
    const overviewBody = await overview.json() as {
      latestRun?: { id?: string };
      alerts?: unknown[];
    };
    assert.equal(overviewBody.latestRun?.id, body.run?.id);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('permite reconocer y resolver una alerta', async () => {
  await base.consultar(
    `INSERT INTO system_alerts (
       id, severity, source, title, details, fingerprint,
       occurrence_count, last_seen_at, created_at, updated_at
     ) VALUES ($1, 'WARNING', 'operations-monitor', 'Alerta de prueba',
               '{}'::jsonb, 'operations:test', 1, NOW(), NOW(), NOW())`,
    ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']
  );

  const acknowledged = await fetch(
    `${baseUrl}/api/v1/operations/alerts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/acknowledge`,
    { method: 'POST', headers: headers(), body: '{}' }
  );
  assert.equal(acknowledged.status, 200);
  const acknowledgedBody = await acknowledged.json() as {
    alert?: { acknowledgedAt?: string | null };
  };
  assert.ok(acknowledgedBody.alert?.acknowledgedAt);

  const resolved = await fetch(
    `${baseUrl}/api/v1/operations/alerts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/resolve`,
    { method: 'POST', headers: headers(), body: '{}' }
  );
  assert.equal(resolved.status, 200);
  const resolvedBody = await resolved.json() as {
    alert?: { resolvedAt?: string | null };
  };
  assert.ok(resolvedBody.alert?.resolvedAt);
});
