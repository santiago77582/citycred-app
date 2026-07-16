import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv, TEST_META_APP_SECRET } from './helpers/entornoPruebas.js';

applyTestEnv();

const { prepararBaseEnMemoria } = await import('./helpers/baseEnMemoria.js');
const {
  iniciarServidorDePruebas,
  firmaDeMeta,
  postWebhook,
  payloadMensajeEntrante
} = await import('./helpers/servidorHttp.js');

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

async function contarEventosWebhook(): Promise<number> {
  const resultado = await db.consultar('SELECT COUNT(*) AS n FROM webhook_events');
  return Number(resultado.rows[0]?.n ?? -1);
}

test('acepta un POST con firma HMAC válida y persiste el evento', async () => {
  const cuerpo = JSON.stringify(
    payloadMensajeEntrante({ wamid: 'wamid.firma.ok', de: '5492900000201', texto: 'hola' })
  );

  const res = await postWebhook(baseUrl, cuerpo, firmaDeMeta(cuerpo, TEST_META_APP_SECRET));
  const body = (await res.json()) as Record<string, unknown>;

  assert.equal(res.status, 200);
  assert.equal(body.received, true);
  assert.equal(await contarEventosWebhook(), 1);
});

test('rechaza con 401 una firma calculada con otro secreto y no persiste nada', async () => {
  const cuerpo = JSON.stringify(
    payloadMensajeEntrante({ wamid: 'wamid.firma.mala', de: '5492900000202', texto: 'hola' })
  );

  const res = await postWebhook(baseUrl, cuerpo, firmaDeMeta(cuerpo, 'otro-secreto-distinto'));

  assert.equal(res.status, 401);
  assert.equal(await contarEventosWebhook(), 0);
});

test('rechaza con 401 un POST sin encabezado de firma', async () => {
  const cuerpo = JSON.stringify(
    payloadMensajeEntrante({ wamid: 'wamid.sin.firma', de: '5492900000203', texto: 'hola' })
  );

  const res = await postWebhook(baseUrl, cuerpo);

  assert.equal(res.status, 401);
  assert.equal(await contarEventosWebhook(), 0);
});

test('rechaza con 401 un encabezado de firma malformado', async () => {
  const cuerpo = JSON.stringify(
    payloadMensajeEntrante({ wamid: 'wamid.firma.rara', de: '5492900000204', texto: 'hola' })
  );

  for (const firma of ['md5=abc', 'sha256=no-hexadecimal', 'sha256=1234']) {
    const res = await postWebhook(baseUrl, cuerpo, firma);
    assert.equal(res.status, 401, `la firma "${firma}" debería rechazarse`);
  }
  assert.equal(await contarEventosWebhook(), 0);
});

test('la firma se valida sobre el cuerpo crudo: alterar un byte la invalida', async () => {
  const cuerpo = JSON.stringify(
    payloadMensajeEntrante({ wamid: 'wamid.byte', de: '5492900000205', texto: 'hola' })
  );
  const firmaOriginal = firmaDeMeta(cuerpo, TEST_META_APP_SECRET);
  const cuerpoAlterado = cuerpo.replace('hola', 'holA');

  const res = await postWebhook(baseUrl, cuerpoAlterado, firmaOriginal);

  assert.equal(res.status, 401);
  assert.equal(await contarEventosWebhook(), 0);
});

test('responde 400 ante un cuerpo que no es JSON válido', async () => {
  const cuerpo = 'esto-no-es-json';

  const res = await postWebhook(baseUrl, cuerpo, firmaDeMeta(cuerpo, TEST_META_APP_SECRET));

  assert.equal(res.status, 400);
  assert.equal(await contarEventosWebhook(), 0);
});

test('rechaza un payload que supera el límite de 1 MB sin persistirlo', async () => {
  const relleno = 'x'.repeat(1_200_000);
  const cuerpo = JSON.stringify({ object: 'whatsapp_business_account', relleno });

  const res = await postWebhook(baseUrl, cuerpo, firmaDeMeta(cuerpo, TEST_META_APP_SECRET));

  assert.ok(res.status >= 400, `esperaba un rechazo, llegó HTTP ${res.status}`);
  assert.equal(await contarEventosWebhook(), 0);
});

test('un payload firmado con estructura inesperada no rompe la API', async () => {
  // entry con un tipo no iterable: el procesamiento falla de forma controlada,
  // el evento queda registrado con su error y la API no devuelve un 5xx crudo.
  const cuerpo = JSON.stringify({ object: 'whatsapp_business_account', entry: 123 });

  const res = await postWebhook(baseUrl, cuerpo, firmaDeMeta(cuerpo, TEST_META_APP_SECRET));

  assert.ok(res.status === 200 || res.status === 500);
  const eventos = await db.consultar('SELECT error FROM webhook_events');
  assert.equal(eventos.rows.length, 1);
  assert.notEqual(eventos.rows[0]?.error, null);
});

test('un payload firmado sin mensajes ni estados responde 200 y no crea mensajes', async () => {
  const cuerpo = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: 'x', changes: [{ field: 'messages', value: {} }] }]
  });

  const res = await postWebhook(baseUrl, cuerpo, firmaDeMeta(cuerpo, TEST_META_APP_SECRET));

  assert.equal(res.status, 200);
  const mensajes = await db.consultar('SELECT COUNT(*) AS n FROM messages');
  assert.equal(Number(mensajes.rows[0]?.n), 0);
});
