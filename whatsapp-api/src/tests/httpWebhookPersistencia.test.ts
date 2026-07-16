import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { applyTestEnv, TEST_META_APP_SECRET } from './helpers/entornoPruebas.js';

applyTestEnv();

const { prepararBaseEnMemoria } = await import('./helpers/baseEnMemoria.js');
const {
  iniciarServidorDePruebas,
  firmaDeMeta,
  postWebhook,
  payloadMensajeEntrante,
  payloadEstado
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

async function enviarWebhookFirmado(payload: unknown): Promise<Response> {
  const cuerpo = JSON.stringify(payload);
  return postWebhook(baseUrl, cuerpo, firmaDeMeta(cuerpo, TEST_META_APP_SECRET));
}

/** Crea contacto + conversación + mensaje SALIENTE, como queda tras un envío real. */
async function sembrarMensajeSaliente(wamid: string, estado = 'PENDING'): Promise<void> {
  const contactoId = randomUUID();
  const conversacionId = randomUUID();
  await db.consultar(
    `INSERT INTO contacts (id, wa_id, phone) VALUES ($1, $2, $2)`,
    [contactoId, `549290000${wamid.length}${Math.floor(Math.random() * 100000)}`]
  );
  await db.consultar(
    `INSERT INTO conversations (id, contact_id) VALUES ($1, $2)`,
    [conversacionId, contactoId]
  );
  await db.consultar(
    `INSERT INTO messages (id, wamid, conversation_id, direction, type, text, status, raw)
     VALUES ($1, $2, $3, 'OUTBOUND', 'text', 'mensaje de prueba', $4, '{}'::jsonb)`,
    [randomUUID(), wamid, conversacionId, estado]
  );
}

async function estadoDelMensaje(wamid: string): Promise<string | null> {
  const resultado = await db.consultar('SELECT status FROM messages WHERE wamid = $1', [wamid]);
  return (resultado.rows[0]?.status as string | undefined) ?? null;
}

async function contarMensajes(wamid: string): Promise<number> {
  const resultado = await db.consultar(
    'SELECT COUNT(*) AS n FROM messages WHERE wamid = $1',
    [wamid]
  );
  return Number(resultado.rows[0]?.n ?? -1);
}

test('un webhook duplicado con el mismo wamid persiste el mensaje una sola vez', async () => {
  const payload = payloadMensajeEntrante({
    wamid: 'wamid.idempotencia.1',
    de: '5492900000301',
    texto: 'mensaje repetido'
  });

  const primera = await enviarWebhookFirmado(payload);
  const segunda = await enviarWebhookFirmado(payload);

  assert.equal(primera.status, 200);
  assert.equal(segunda.status, 200);
  assert.equal(await contarMensajes('wamid.idempotencia.1'), 1);

  // Cada entrega queda registrada como evento aunque el mensaje no se duplique.
  const eventos = await db.consultar('SELECT COUNT(*) AS n FROM webhook_events');
  assert.equal(Number(eventos.rows[0]?.n), 2);
});

test('la progresión SENT → DELIVERED → READ avanza en orden', async () => {
  const wamid = 'wamid.progresion.1';
  await sembrarMensajeSaliente(wamid, 'PENDING');

  for (const [estadoMeta, estadoEsperado] of [
    ['sent', 'SENT'],
    ['delivered', 'DELIVERED'],
    ['read', 'READ']
  ] as const) {
    const res = await enviarWebhookFirmado(payloadEstado({ wamid, estado: estadoMeta }));
    assert.equal(res.status, 200);
    assert.equal(await estadoDelMensaje(wamid), estadoEsperado, `tras el estado ${estadoMeta}`);
  }
});

test('rechaza retrocesos: un delivered tardío no pisa un READ', async () => {
  const wamid = 'wamid.retroceso.1';
  await sembrarMensajeSaliente(wamid, 'PENDING');

  await enviarWebhookFirmado(payloadEstado({ wamid, estado: 'read' }));
  assert.equal(await estadoDelMensaje(wamid), 'READ');

  const tardio = await enviarWebhookFirmado(payloadEstado({ wamid, estado: 'delivered' }));
  assert.equal(tardio.status, 200);
  assert.equal(await estadoDelMensaje(wamid), 'READ');
});

test('un estado duplicado no cambia nada (reintento de Meta inofensivo)', async () => {
  const wamid = 'wamid.duplicado.1';
  await sembrarMensajeSaliente(wamid, 'PENDING');

  await enviarWebhookFirmado(payloadEstado({ wamid, estado: 'delivered' }));
  await enviarWebhookFirmado(payloadEstado({ wamid, estado: 'delivered' }));

  assert.equal(await estadoDelMensaje(wamid), 'DELIVERED');
  assert.equal(await contarMensajes(wamid), 1);
});

test('un evento failed marca FAILED y guarda el detalle del error', async () => {
  const wamid = 'wamid.fallado.1';
  await sembrarMensajeSaliente(wamid, 'PENDING');

  const res = await enviarWebhookFirmado(
    payloadEstado({
      wamid,
      estado: 'failed',
      errores: [{ code: 131047, title: 'Fuera de la ventana de 24 horas' }]
    })
  );
  assert.equal(res.status, 200);

  const fila = await db.consultar(
    'SELECT status, error_code, error_message FROM messages WHERE wamid = $1',
    [wamid]
  );
  assert.equal(fila.rows[0]?.status, 'FAILED');
  assert.equal(fila.rows[0]?.error_code, '131047');
  assert.equal(fila.rows[0]?.error_message, 'Fuera de la ventana de 24 horas');
});

test('FAILED gana aunque el mensaje ya estuviera en READ', async () => {
  const wamid = 'wamid.fallado.2';
  await sembrarMensajeSaliente(wamid, 'READ');

  await enviarWebhookFirmado(
    payloadEstado({ wamid, estado: 'failed', errores: [{ code: 1, title: 'Error definitivo' }] })
  );
  assert.equal(await estadoDelMensaje(wamid), 'FAILED');
});

test(
  'FAILED debería ser definitivo: un delivered posterior no tendría que pisarlo',
  // DEFECTO DOCUMENTADO (no se corrige acá porque src/repository.ts está
  // reservado por el PR #7): en updateMessageStatus, el estado actual FAILED
  // cae en el ELSE -1 del CASE, por lo que cualquier estado posterior
  // (SENT/DELIVERED/READ) lo sobreescribe. Un reintento fuera de orden de Meta
  // puede "revivir" un mensaje fallado. Detalle en el PR de esta suite.
  { todo: 'defecto en updateMessageStatus; corregir en repository.ts cuando cierre el PR #7' },
  async () => {
    const wamid = 'wamid.fallado.3';
    await sembrarMensajeSaliente(wamid, 'PENDING');

    await enviarWebhookFirmado(
      payloadEstado({ wamid, estado: 'failed', errores: [{ code: 1, title: 'Error definitivo' }] })
    );
    assert.equal(await estadoDelMensaje(wamid), 'FAILED');

    await enviarWebhookFirmado(payloadEstado({ wamid, estado: 'delivered' }));
    assert.equal(await estadoDelMensaje(wamid), 'FAILED');
  }
);

test('un estado para un wamid desconocido responde 200 y no crea filas', async () => {
  const res = await enviarWebhookFirmado(
    payloadEstado({ wamid: 'wamid.inexistente.1', estado: 'delivered' })
  );

  assert.equal(res.status, 200);
  assert.equal(await contarMensajes('wamid.inexistente.1'), 0);
});

test('un estado no modifica mensajes ENTRANTES aunque coincida el wamid', async () => {
  const payload = payloadMensajeEntrante({
    wamid: 'wamid.entrante.1',
    de: '5492900000302',
    texto: 'hola'
  });
  await enviarWebhookFirmado(payload);
  assert.equal(await estadoDelMensaje('wamid.entrante.1'), 'RECEIVED');

  await enviarWebhookFirmado(payloadEstado({ wamid: 'wamid.entrante.1', estado: 'read' }));
  assert.equal(await estadoDelMensaje('wamid.entrante.1'), 'RECEIVED');
});

test('si falla la persistencia después de registrar el evento, el error queda registrado y el reintento de Meta procesa una sola vez', async () => {
  const payload = payloadMensajeEntrante({
    wamid: 'wamid.reintento.1',
    de: '5492900000303',
    texto: 'mensaje con base inestable'
  });

  // Falla solo la inserción del mensaje; el evento webhook sí se guarda.
  db.simularFalloDeBase((sql) => sql.includes('INSERT INTO messages'));
  const conFallo = await enviarWebhookFirmado(payload);

  // Contrato actual en main: 200 (el evento quedó guardado con su error para
  // reproceso). El PR #2 lo cambia a 500 para que Meta reintente solo.
  // Lo invariante en ambos contratos: el evento no se pierde.
  assert.ok(
    conFallo.status === 200 || conFallo.status === 500,
    `respuesta inesperada: HTTP ${conFallo.status}`
  );
  const eventos = await db.consultar(
    'SELECT error FROM webhook_events ORDER BY received_at'
  );
  assert.equal(eventos.rows.length, 1);
  assert.notEqual(eventos.rows[0]?.error, null, 'el evento debe registrar el error');
  assert.equal(await contarMensajes('wamid.reintento.1'), 0);

  // La base se recupera y Meta reintenta el mismo webhook: se procesa bien,
  // exactamente una vez (idempotencia por wamid).
  db.restaurarBase();
  const reintento = await enviarWebhookFirmado(payload);
  assert.equal(reintento.status, 200);
  assert.equal(await contarMensajes('wamid.reintento.1'), 1);
});

test(
  'si ni siquiera se puede guardar el evento, la respuesta debería ser 5xx para que Meta reintente',
  // COMPORTAMIENTO DESEADO (contrato del PR #2, aún no mergeado): hoy en main
  // este caso devuelve 200 y el evento se pierde en silencio. Cuando el PR #2
  // se integre, este test debe pasar y dejar de estar marcado como todo.
  { todo: 'depende del PR #2 (webhook responde 500 cuando no puede persistir)' },
  async () => {
    const payload = payloadMensajeEntrante({
      wamid: 'wamid.perdido.1',
      de: '5492900000304',
      texto: 'evento imposible de guardar'
    });

    db.simularFalloDeBase((sql) => sql.includes('INSERT INTO webhook_events'));
    const res = await enviarWebhookFirmado(payload);

    assert.ok(res.status >= 500, `esperaba 5xx para forzar reintento, llegó ${res.status}`);
  }
);
