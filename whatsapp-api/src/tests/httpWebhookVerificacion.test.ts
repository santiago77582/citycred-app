import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv, TEST_VERIFY_TOKEN } from './helpers/entornoPruebas.js';

applyTestEnv();

const { prepararBaseEnMemoria } = await import('./helpers/baseEnMemoria.js');
const { iniciarServidorDePruebas } = await import('./helpers/servidorHttp.js');

// La verificación GET no toca la base, pero se prepara igual para que ningún
// middleware intente usar el pool real.
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

function urlVerificacion(params: Record<string, string>): string {
  const query = new URLSearchParams(params);
  return `${baseUrl}/webhooks/whatsapp?${query.toString()}`;
}

test('devuelve el challenge en texto plano con mode y token correctos', async () => {
  const res = await fetch(
    urlVerificacion({
      'hub.mode': 'subscribe',
      'hub.verify_token': TEST_VERIFY_TOKEN,
      'hub.challenge': 'desafio-12345'
    })
  );

  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/plain/);
  assert.equal(await res.text(), 'desafio-12345');
});

test('rechaza con 403 un verify token incorrecto', async () => {
  const res = await fetch(
    urlVerificacion({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'token-equivocado',
      'hub.challenge': 'desafio-12345'
    })
  );
  assert.equal(res.status, 403);
});

test('rechaza con 403 un mode distinto de subscribe', async () => {
  const res = await fetch(
    urlVerificacion({
      'hub.mode': 'unsubscribe',
      'hub.verify_token': TEST_VERIFY_TOKEN,
      'hub.challenge': 'desafio-12345'
    })
  );
  assert.equal(res.status, 403);
});

test('rechaza con 403 si falta el challenge', async () => {
  const res = await fetch(
    urlVerificacion({
      'hub.mode': 'subscribe',
      'hub.verify_token': TEST_VERIFY_TOKEN
    })
  );
  assert.equal(res.status, 403);
});

test('rechaza con 403 si no llega ningún parámetro', async () => {
  const res = await fetch(`${baseUrl}/webhooks/whatsapp`);
  assert.equal(res.status, 403);
});
