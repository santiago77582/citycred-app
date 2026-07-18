import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { applyTestEnv, TEST_API_KEY } from './helpers/entornoPruebas.js';
import { prepararBaseEnMemoria } from './helpers/baseEnMemoria.js';
import { iniciarServidorDePruebas } from './helpers/servidorHttp.js';

applyTestEnv();
const base = await prepararBaseEnMemoria();
const server = await iniciarServidorDePruebas();

test.after(async () => server.cerrar());
test.afterEach(() => base.reiniciar());

async function seedMinimalData(): Promise<void> {
  const contactId = randomUUID();
  const conversationId = randomUUID();
  await base.consultar(
    `INSERT INTO contacts (
       id, wa_id, phone, profile_name, commercial_status, consent_status
     ) VALUES ($1, '5492918888888', '5492918888888', 'Cliente tablero', 'INTERESTED', 'GRANTED')`,
    [contactId]
  );
  await base.consultar(
    `INSERT INTO conversations (id, contact_id, last_message_at)
     VALUES ($1, $2, NOW())`,
    [conversationId, contactId]
  );
  await base.consultar(
    `INSERT INTO messages (
       id, conversation_id, direction, type, text, status, raw
     ) VALUES ($1, $2, 'INBOUND', 'text', 'Hola', 'RECEIVED', '{}'::jsonb)`,
    [randomUUID(), conversationId]
  );
}

async function tableCounts(): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const table of ['contacts', 'conversations', 'messages', 'campaigns', 'system_alerts']) {
    const count = await base.consultar(`SELECT COUNT(*)::int AS total FROM ${table}`);
    result[table] = Number(count.rows[0]?.total ?? 0);
  }
  return result;
}

test('requiere clave de API', async () => {
  const response = await fetch(`${server.baseUrl}/api/v1/analytics/dashboard`);
  assert.equal(response.status, 401);
});

test('devuelve un tablero privado sin modificar datos', async () => {
  await seedMinimalData();
  const before = await tableCounts();
  const response = await fetch(
    `${server.baseUrl}/api/v1/analytics/dashboard?days=7`,
    { headers: { 'x-api-key': TEST_API_KEY } }
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/);
  const body = await response.json() as {
    dashboard?: {
      period?: { days?: number };
      contacts?: { total?: number };
      messages?: { inbound?: number };
    };
  };
  assert.equal(body.dashboard?.period?.days, 7);
  assert.equal(body.dashboard?.contacts?.total, 1);
  assert.equal(body.dashboard?.messages?.inbound, 1);
  const after = await tableCounts();
  assert.deepEqual(after, before);
});

test('rechaza períodos fuera del rango permitido', async () => {
  for (const days of [0, 367]) {
    const response = await fetch(
      `${server.baseUrl}/api/v1/analytics/dashboard?days=${days}`,
      { headers: { 'x-api-key': TEST_API_KEY } }
    );
    assert.equal(response.status, 400);
  }
});
