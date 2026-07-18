import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTestEnv, TEST_API_KEY } from './helpers/entornoPruebas.js';
import { prepararBaseEnMemoria } from './helpers/baseEnMemoria.js';
import { iniciarServidorDePruebas } from './helpers/servidorHttp.js';

applyTestEnv({
  META_GRAPH_VERSION: 'v23.0',
  WHATSAPP_ACCESS_TOKEN: 'token-avanzado-pruebas',
  WHATSAPP_PHONE_NUMBER_ID: '123456789'
});

const base = await prepararBaseEnMemoria();
const server = await iniciarServidorDePruebas();
const {
  buildContactsMessage,
  buildListMessage,
  buildLocationMessage
} = await import('../routes/advancedMessages.js');
const { messageText } = await import('../services/webhookMessage.js');

test.after(async () => server.cerrar());
test.afterEach(() => base.reiniciar());

async function post(path: string, body: unknown): Promise<Response> {
  return fetch(`${server.baseUrl}/api/v1/messages${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': TEST_API_KEY
    },
    body: JSON.stringify(body)
  });
}

test('envía botones oficiales y persiste el mensaje', async () => {
  const originalFetch = globalThis.fetch;
  let metaBody: Record<string, unknown> | null = null;
  let metaCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(server.baseUrl)) return originalFetch(input, init);
    metaCalls += 1;
    metaBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ messages: [{ id: 'wamid-botones-1' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const response = await post('/interactive/buttons', {
      to: '5492911111111',
      header: 'CityCred',
      body: '¿A qué fuerza pertenecés?',
      footer: 'Elegí una opción',
      buttons: [
        { id: 'ejercito', title: 'Ejército' },
        { id: 'armada', title: 'Armada' },
        { id: 'prefectura', title: 'Prefectura' }
      ]
    });
    assert.equal(response.status, 201);
    assert.equal(metaCalls, 1);
    assert.equal(metaBody?.type, 'interactive');
    const interactive = metaBody?.interactive as Record<string, unknown>;
    assert.equal(interactive.type, 'button');
    const action = interactive.action as { buttons: unknown[] };
    assert.equal(action.buttons.length, 3);

    const saved = await base.consultar(
      `SELECT wamid, type, text, status FROM messages WHERE wamid = 'wamid-botones-1'`
    );
    assert.equal(saved.rows.length, 1);
    assert.equal(saved.rows[0]?.type, 'interactive_button');
    assert.equal(saved.rows[0]?.text, '¿A qué fuerza pertenecés?');
    assert.equal(saved.rows[0]?.status, 'PENDING');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('construye ubicación y contacto con los nombres oficiales de Meta', () => {
  assert.deepEqual(buildLocationMessage({
    to: '5492911111111',
    latitude: -40.8135,
    longitude: -62.9967,
    name: 'CityCred',
    address: 'Viedma, Río Negro',
    replyToMessageId: 'wamid-origen'
  }), {
    type: 'location',
    location: {
      latitude: -40.8135,
      longitude: -62.9967,
      name: 'CityCred',
      address: 'Viedma, Río Negro'
    },
    context: { message_id: 'wamid-origen' }
  });

  const contact = buildContactsMessage({
    to: '5492911111111',
    contacts: [{
      formattedName: 'CityCred',
      firstName: 'CityCred',
      phones: [{ phone: '+54 9 291 471-7121', waId: '5492914717121', type: 'WORK' }],
      emails: [{ email: 'contacto@citycred.test', type: 'WORK' }],
      organization: { company: 'CityCred', title: 'Créditos personales' }
    }]
  });
  const contacts = contact.contacts as Array<Record<string, unknown>>;
  const first = contacts[0] as Record<string, unknown>;
  assert.deepEqual(first.name, {
    formatted_name: 'CityCred',
    first_name: 'CityCred'
  });
  assert.deepEqual(first.phones, [{
    phone: '+54 9 291 471-7121',
    wa_id: '5492914717121',
    type: 'WORK'
  }]);
});

test('rechaza una lista con más de diez opciones antes de contactar a Meta', async () => {
  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(server.baseUrl)) return originalFetch(input, init);
    externalCalls += 1;
    throw new Error('No debía contactar a Meta');
  };

  try {
    const rows = Array.from({ length: 11 }, (_, index) => ({
      id: `opcion-${index}`,
      title: `Opción ${index}`
    }));
    const response = await post('/interactive/list', {
      to: '5492911111111',
      body: 'Elegí una opción',
      button: 'Ver opciones',
      sections: [
        { title: 'Primera', rows: rows.slice(0, 6) },
        { title: 'Segunda', rows: rows.slice(6) }
      ]
    });
    assert.equal(response.status, 400);
    assert.equal(externalCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('interpreta respuestas entrantes de botones listas ubicación contactos y reacciones', () => {
  assert.equal(messageText({
    type: 'interactive',
    interactive: { type: 'button_reply', button_reply: { id: 'ejercito', title: 'Ejército' } }
  }), 'Ejército');

  assert.equal(messageText({
    type: 'interactive',
    interactive: {
      type: 'list_reply',
      list_reply: { id: 'uno', title: 'Opción uno', description: 'Descripción' }
    }
  }), 'Opción uno — Descripción');

  assert.equal(messageText({
    type: 'location',
    location: {
      name: 'Viedma', address: 'Río Negro', latitude: -40.8, longitude: -63
    }
  }), '[Ubicación] — Viedma — Río Negro — -40.8, -63');

  assert.equal(messageText({
    type: 'contacts',
    contacts: [{ name: { formatted_name: 'Juan Pérez' } }]
  }), '[Contacto] Juan Pérez');

  assert.equal(messageText({
    type: 'reaction',
    reaction: { message_id: 'wamid-1', emoji: '👍' }
  }), '👍');
});

test('construye una lista válida con secciones y contexto', () => {
  const message = buildListMessage({
    to: '5492911111111',
    body: 'Seleccioná una fuerza',
    button: 'Fuerzas',
    footer: 'CityCred',
    sections: [{
      title: 'Opciones',
      rows: [
        { id: 'ejercito', title: 'Ejército' },
        { id: 'armada', title: 'Armada', description: 'Personal de Armada' }
      ]
    }],
    replyToMessageId: 'wamid-previo'
  });
  assert.equal(message.type, 'interactive');
  assert.deepEqual(message.context, { message_id: 'wamid-previo' });
  const interactive = message.interactive as Record<string, unknown>;
  assert.equal(interactive.type, 'list');
});
