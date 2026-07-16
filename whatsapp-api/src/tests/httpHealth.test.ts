import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv } from './helpers/entornoPruebas.js';

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

test('GET /health responde 200 y database ok con la base disponible', async () => {
  const res = await fetch(`${baseUrl}/health`);
  const body = (await res.json()) as Record<string, unknown>;

  assert.equal(res.status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.database, 'ok');
  assert.equal(body.entorno, 'test');
});

test('GET /health responde 503 y degraded con la base caída', async () => {
  db.simularFalloDeBase();

  const res = await fetch(`${baseUrl}/health`);
  const body = (await res.json()) as Record<string, unknown>;

  assert.equal(res.status, 503);
  assert.equal(body.status, 'degraded');
  assert.equal(body.database, 'error');
});

test('GET /health se recupera cuando la base vuelve', async () => {
  db.simularFalloDeBase();
  const caida = await fetch(`${baseUrl}/health`);
  assert.equal(caida.status, 503);

  db.restaurarBase();
  const recuperada = await fetch(`${baseUrl}/health`);
  assert.equal(recuperada.status, 200);
});

test('GET /health no exige API key (es un endpoint público de monitoreo)', async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
});
