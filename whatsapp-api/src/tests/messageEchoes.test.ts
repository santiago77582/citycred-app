import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { applyTestEnv, TEST_META_APP_SECRET } from './helpers/entornoPruebas.js';

applyTestEnv();

const { prepararBaseEnMemoria } = await import('./helpers/baseEnMemoria.js');
const { iniciarServidorDePruebas, firmaDeMeta, postWebhook } = await import('./helpers/servidorHttp.js');
const { isConversationBotPaused, listMessagesByWaId } = await import('../repository.js');

const base = await prepararBaseEnMemoria();

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

/** Payload de Meta con un eco: un mensaje que el negocio envió desde el celular. */
function payloadEco(params: { wamid: string; para: string; texto: string; campo?: string }): string {
  const campo = params.campo ?? 'message_echoes';
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{
      id: '747167224527947',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '5492914717121', phone_number_id: 'x' },
          [campo]: [{
            id: params.wamid,
            to: params.para,
            from: '5492914717121',
            type: 'text',
            text: { body: params.texto }
          }]
        }
      }]
    }]
  });
}

async function enviar(cuerpo: string): Promise<Response> {
  return postWebhook(baseUrl, cuerpo, firmaDeMeta(cuerpo, TEST_META_APP_SECRET));
}

test('una respuesta enviada desde el celular aparece en el panel como saliente', async () => {
  const waId = '5492920800001';
  const cuerpo = payloadEco({ wamid: 'wamid.ECO1', para: waId, texto: 'Te paso el cupo por privado' });
  const response = await enviar(cuerpo);
  assert.equal(response.status, 200);

  const mensajes = await listMessagesByWaId(waId, 50);
  assert.equal(mensajes.length, 1);
  assert.equal(mensajes[0]?.direction, 'OUTBOUND');
  assert.equal(mensajes[0]?.text, 'Te paso el cupo por privado');
});

test('tambien acepta el campo smb_message_echoes de coexistencia', async () => {
  const waId = '5492920800002';
  const cuerpo = payloadEco({
    wamid: 'wamid.ECO2', para: waId, texto: 'Respuesta desde la app', campo: 'smb_message_echoes'
  });
  assert.equal((await enviar(cuerpo)).status, 200);

  const mensajes = await listMessagesByWaId(waId, 50);
  assert.equal(mensajes.length, 1);
  assert.equal(mensajes[0]?.direction, 'OUTBOUND');
});

test('reenviar el mismo eco no duplica el mensaje', async () => {
  const waId = '5492920800003';
  const cuerpo = payloadEco({ wamid: 'wamid.ECO3', para: waId, texto: 'Mensaje unico' });
  await enviar(cuerpo);
  await enviar(cuerpo);
  await enviar(cuerpo);

  const total = await base.consultar(
    `SELECT COUNT(*)::int AS n FROM messages WHERE wamid = $1`,
    ['wamid.ECO3']
  );
  assert.equal(total.rows[0]?.n, 1);
});

test('responder desde el celular pausa el bot para no contestar encima', async () => {
  const waId = '5492920800004';
  await enviar(payloadEco({ wamid: 'wamid.ECO4', para: waId, texto: 'Ya te contesto yo' }));
  assert.equal(await isConversationBotPaused(waId), true);
});

test('un webhook normal sin ecos sigue funcionando igual', async () => {
  const waId = '5492920800005';
  const cuerpo = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{
      id: '747167224527947',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '5492914717121', phone_number_id: 'x' },
          contacts: [{ wa_id: waId, profile: { name: 'Cliente Normal' } }],
          messages: [{
            id: 'wamid.NORMAL1', from: waId, timestamp: '1760000000',
            type: 'text', text: { body: 'Hola, consulto por un credito' }
          }]
        }
      }]
    }]
  });
  assert.equal((await enviar(cuerpo)).status, 200);

  const mensajes = await listMessagesByWaId(waId, 50);
  assert.equal(mensajes.length, 1);
  assert.equal(mensajes[0]?.direction, 'INBOUND');
  // Un mensaje entrante NO pausa el bot.
  assert.equal(await isConversationBotPaused(waId), false);
});
