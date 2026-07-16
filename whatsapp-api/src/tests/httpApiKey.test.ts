import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv, TEST_API_KEY } from './helpers/entornoPruebas.js';

applyTestEnv();

const { prepararBaseEnMemoria } = await import('./helpers/baseEnMemoria.js');
const { iniciarServidorDePruebas } = await import('./helpers/servidorHttp.js');

const db = await prepararBaseEnMemoria();
let baseUrl = '';
let cerrar: () => Promise<void> = async () => {};

before(async () => {
  const servidor = await iniciarServidorDePruebas();
  baseUrl = servidor.baseUrl;
  cerrar = servidor.cerrar;
});

beforeEach(() => {
  db.reiniciar();
});

after(async () => {
  await cerrar();
});

test('rechaza con 401 una solicitud a /api/v1/** sin API key', async () => {
  const res = await fetch(`${baseUrl}/api/v1/conversations`);
  const body = (await res.json()) as Record<string, unknown>;

  assert.equal(res.status, 401);
  assert.equal(typeof body.error, 'string');
});

test('rechaza con 401 una API key incorrecta', async () => {
  const res = await fetch(`${baseUrl}/api/v1/conversations`, {
    headers: { 'x-api-key': 'clave-equivocada-pero-larga-123456789' }
  });
  assert.equal(res.status, 401);
});

test('rechaza con 401 una API key que es prefijo de la real', async () => {
  const res = await fetch(`${baseUrl}/api/v1/conversations`, {
    headers: { 'x-api-key': TEST_API_KEY.slice(0, TEST_API_KEY.length - 1) }
  });
  assert.equal(res.status, 401);
});

test('acepta la API key correcta y responde datos', async () => {
  const res = await fetch(
    `${baseUrl}/api/v1/conversations/5492900000123/messages`,
    { headers: { 'x-api-key': TEST_API_KEY } }
  );
  const body = (await res.json()) as { waId?: string; messages?: unknown[] };

  assert.equal(res.status, 200);
  assert.equal(body.waId, '5492900000123');
  assert.deepEqual(body.messages, []);
});

test('la protección cubre también rutas /api/v1 inexistentes (401 antes que 404)', async () => {
  const res = await fetch(`${baseUrl}/api/v1/lo-que-sea`);
  assert.equal(res.status, 401);
});

test('una ruta desconocida fuera de /api/v1 responde 404 sin pedir API key', async () => {
  const res = await fetch(`${baseUrl}/ruta-inexistente`);
  assert.equal(res.status, 404);
});
