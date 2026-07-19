import assert from 'node:assert/strict';
import {
  constants,
  createCipheriv,
  createDecipheriv,
  createHmac,
  generateKeyPairSync,
  publicEncrypt,
  randomBytes
} from 'node:crypto';
import test from 'node:test';
import {
  applyTestEnv,
  TEST_API_KEY,
  TEST_META_APP_SECRET
} from './helpers/entornoPruebas.js';
import { prepararBaseEnMemoria } from './helpers/baseEnMemoria.js';
import { iniciarServidorDePruebas } from './helpers/servidorHttp.js';

const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const endpointPassphrase = 'flow-endpoint-passphrase-pruebas';
const endpointPem = pair.privateKey.export({
  type: 'pkcs8',
  format: 'pem',
  cipher: 'aes-256-cbc',
  passphrase: endpointPassphrase
}).toString();
const storageMaterial = randomBytes(32).toString('base64');

applyTestEnv({
  FLOW_ENDPOINT_ENABLED: 'true',
  FLOW_ENDPOINT_MATERIAL: endpointPem,
  FLOW_ENDPOINT_PASSPHRASE: endpointPassphrase,
  FLOW_STORAGE_MATERIAL: storageMaterial,
  FLOW_INITIAL_SCREEN: 'INICIO',
  META_GRAPH_VERSION: 'v23.0',
  WHATSAPP_ACCESS_TOKEN: 'token-flow-endpoint-pruebas',
  WHATSAPP_PHONE_NUMBER_ID: '123456789',
  WHATSAPP_BUSINESS_ACCOUNT_ID: '987654321'
});

const base = await prepararBaseEnMemoria();
const server = await iniciarServidorDePruebas();
const { registerFlowToken } = await import('../flows/flowEndpointRepository.js');
const { upsertContact, upsertConversation } = await import('../repository.js');

test.after(async () => server.cerrar());
test.afterEach(() => base.reiniciar());

type EncryptedRequest = {
  rawBody: string;
  aesMaterial: Buffer;
  initialVector: Buffer;
};

function encryptedRequest(body: Record<string, unknown>): EncryptedRequest {
  const aesMaterial = randomBytes(16);
  const initialVector = randomBytes(12);
  const cipher = createCipheriv('aes-128-gcm', aesMaterial, initialVector);
  const encryptedData = Buffer.concat([
    cipher.update(JSON.stringify(body), 'utf8'),
    cipher.final(),
    cipher.getAuthTag()
  ]);
  const encryptedMaterial = publicEncrypt(
    {
      key: publicPem,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256'
    },
    aesMaterial
  );
  return {
    rawBody: JSON.stringify({
      encrypted_aes_key: encryptedMaterial.toString('base64'),
      encrypted_flow_data: encryptedData.toString('base64'),
      initial_vector: initialVector.toString('base64')
    }),
    aesMaterial,
    initialVector
  };
}

function signature(rawBody: string): string {
  return `sha256=${createHmac('sha256', TEST_META_APP_SECRET)
    .update(rawBody)
    .digest('hex')}`;
}

function decryptResponse(
  encoded: string,
  aesMaterial: Buffer,
  initialVector: Buffer
): Record<string, unknown> {
  const encrypted = Buffer.from(encoded, 'base64');
  const ciphertext = encrypted.subarray(0, -16);
  const tag = encrypted.subarray(-16);
  const inverted = Buffer.from(initialVector.map((value) => value ^ 0xff));
  const decipher = createDecipheriv('aes-128-gcm', aesMaterial, inverted);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]).toString('utf8')) as Record<string, unknown>;
}

async function postFlow(request: EncryptedRequest, customSignature?: string): Promise<Response> {
  return fetch(`${server.baseUrl}/flows/data-exchange`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': customSignature ?? signature(request.rawBody)
    },
    body: request.rawBody
  });
}

async function prepareToken(token: string, waId = '5492917777777'): Promise<void> {
  const contact = await upsertContact(waId, 'Cliente Flow');
  await upsertConversation(contact.id);
  await registerFlowToken({ token, flowId: 'flow-citycred-1', waId });
}

test('informa estado activo sin revelar materiales configurados', async () => {
  const response = await fetch(`${server.baseUrl}/flows/data-exchange`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { active: true });
});

test('rechaza una firma ausente o incorrecta con 432', async () => {
  const request = encryptedRequest({ action: 'ping', data: {} });
  assert.equal((await postFlow(request, 'sha256=' + '0'.repeat(64))).status, 432);
  const missing = await fetch(`${server.baseUrl}/flows/data-exchange`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: request.rawBody
  });
  assert.equal(missing.status, 432);
});

test('responde al ping con datos cifrados', async () => {
  const request = encryptedRequest({ action: 'ping', data: {} });
  const response = await postFlow(request);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type')?.startsWith('text/plain'), true);
  assert.deepEqual(
    decryptResponse(await response.text(), request.aesMaterial, request.initialVector),
    { data: { status: 'active' } }
  );
});

test('inicializa y completa un Flow actualizando solo campos comerciales permitidos', async () => {
  const token = 'flow-token-completo-citycred-123456';
  await prepareToken(token);

  const init = encryptedRequest({
    action: 'INIT',
    flow_token: token,
    data: { source: 'whatsapp' }
  });
  const initResponse = await postFlow(init);
  assert.equal(initResponse.status, 200);
  assert.deepEqual(
    decryptResponse(await initResponse.text(), init.aesMaterial, init.initialVector),
    { screen: 'INICIO', data: { initialized: true } }
  );

  const complete = encryptedRequest({
    action: 'data_exchange',
    screen: 'CONFIRMACION',
    flow_token: token,
    data: {
      complete: true,
      profile_name: 'María Pérez',
      dni: '30111222',
      entity: 'Ejército',
      seniority: 'ONE_YEAR_OR_MORE',
      cupo: '95000',
      cbu: 'dato-protegido-que-no-va-a-la-ficha'
    }
  });
  const completeResponse = await postFlow(complete);
  assert.equal(completeResponse.status, 200);
  const decoded = decryptResponse(
    await completeResponse.text(),
    complete.aesMaterial,
    complete.initialVector
  );
  assert.equal(decoded.screen, 'SUCCESS');

  const tokenRow = await base.consultar(
    `SELECT status, completed_at FROM whatsapp_flow_tokens`
  );
  assert.equal(tokenRow.rows[0]?.status, 'COMPLETED');
  assert.ok(tokenRow.rows[0]?.completed_at);

  const contact = await base.consultar(
    `SELECT profile_name, document_number, entity, seniority_range,
            available_quota, commercial_status, bot_context
     FROM contacts WHERE wa_id = '5492917777777'`
  );
  assert.equal(contact.rows[0]?.profile_name, 'María Pérez');
  assert.equal(contact.rows[0]?.document_number, '30111222');
  assert.equal(contact.rows[0]?.entity, 'Ejército');
  assert.equal(Number(contact.rows[0]?.available_quota), 95000);
  assert.equal(contact.rows[0]?.commercial_status, 'UNDER_REVIEW');
  const botContext = contact.rows[0]?.bot_context as Record<string, unknown> | undefined;
  assert.equal(botContext?.flowId, 'flow-citycred-1');

  const session = await base.consultar(
    `SELECT encrypted_data, data_iv, data_tag, completed
     FROM whatsapp_flow_sessions`
  );
  assert.equal(session.rows[0]?.completed, true);
  assert.ok(Buffer.isBuffer(session.rows[0]?.encrypted_data));
  assert.doesNotMatch(
    Buffer.from(session.rows[0]?.encrypted_data).toString('utf8'),
    /dato-protegido|30111222/
  );
});

test('la navegación ignora pantallas enviadas dentro de data y BACK no completa', async () => {
  const token = 'flow-token-navegacion-segura-123456';
  await prepareToken(token);

  const forward = encryptedRequest({
    action: 'data_exchange',
    screen: 'INICIO',
    flow_token: token,
    data: { next_screen: 'SUCCESS' }
  });
  const forwardResponse = await postFlow(forward);
  assert.equal(forwardResponse.status, 200);
  assert.deepEqual(
    decryptResponse(await forwardResponse.text(), forward.aesMaterial, forward.initialVector),
    { screen: 'DATOS_LABORALES', data: { saved: true } }
  );

  const back = encryptedRequest({
    action: 'BACK',
    screen: 'CONFIRMACION',
    flow_token: token,
    data: { previous_screen: 'INICIO' }
  });
  const backResponse = await postFlow(back);
  assert.equal(backResponse.status, 200);
  assert.deepEqual(
    decryptResponse(await backResponse.text(), back.aesMaterial, back.initialVector),
    { screen: 'DOCUMENTACION', data: { saved: true } }
  );

  const tokenRow = await base.consultar(`SELECT status FROM whatsapp_flow_tokens`);
  assert.equal(tokenRow.rows[0]?.status, 'ACTIVE');
});

test('mantiene el token activo si falla la actualización final y permite reintentar', async () => {
  const token = 'flow-token-reintento-contacto-123456';
  await prepareToken(token);
  base.simularFalloDeBase((sql) => sql.includes('UPDATE contacts SET'));

  const first = encryptedRequest({
    action: 'data_exchange',
    screen: 'CONFIRMACION',
    flow_token: token,
    data: { complete: true, profile_name: 'Cliente recuperado' }
  });
  assert.equal((await postFlow(first)).status, 500);
  base.restaurarBase();

  const active = await base.consultar(`SELECT status FROM whatsapp_flow_tokens`);
  assert.equal(active.rows[0]?.status, 'ACTIVE');

  const retry = encryptedRequest({
    action: 'data_exchange',
    screen: 'CONFIRMACION',
    flow_token: token,
    data: { complete: true, profile_name: 'Cliente recuperado' }
  });
  assert.equal((await postFlow(retry)).status, 200);

  const completed = await base.consultar(`SELECT status FROM whatsapp_flow_tokens`);
  assert.equal(completed.rows[0]?.status, 'COMPLETED');
  const contact = await base.consultar(
    `SELECT profile_name FROM contacts WHERE wa_id = '5492917777777'`
  );
  assert.equal(contact.rows[0]?.profile_name, 'Cliente recuperado');
});

test('un reintento idéntico es idempotente y conserva una sola auditoría', async () => {
  const request = encryptedRequest({ action: 'ping', data: {} });
  const first = await postFlow(request);
  const firstBody = await first.text();
  const second = await postFlow(request);
  const secondBody = await second.text();
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(secondBody, firstBody);

  const events = await base.consultar(
    `SELECT COUNT(*)::int AS count FROM whatsapp_flow_endpoint_events`
  );
  assert.equal(Number(events.rows[0]?.count), 1);
});

test('un token inexistente devuelve un error cifrado 427', async () => {
  const request = encryptedRequest({
    action: 'INIT',
    flow_token: 'token-inexistente-123456',
    data: {}
  });
  const response = await postFlow(request);
  assert.equal(response.status, 427);
  assert.deepEqual(
    decryptResponse(await response.text(), request.aesMaterial, request.initialVector),
    { error_msg: 'Este formulario ya no está disponible.' }
  );
});

test('detecta manipulación del contenido cifrado', async () => {
  const request = encryptedRequest({ action: 'ping', data: {} });
  const envelope = JSON.parse(request.rawBody) as Record<string, string>;
  const encrypted = Buffer.from(envelope.encrypted_flow_data ?? '', 'base64');
  encrypted[0] = (encrypted[0] ?? 0) ^ 0xff;
  envelope.encrypted_flow_data = encrypted.toString('base64');
  const tampered = {
    ...request,
    rawBody: JSON.stringify(envelope)
  };
  const response = await postFlow(tampered);
  assert.equal(response.status, 400);
});

test('registrar el envío de un Flow vincula token número y formulario', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith(server.baseUrl)) return originalFetch(input, init);
    return new Response(JSON.stringify({ messages: [{ id: 'wamid-flow-token-registro' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };
  try {
    const response = await fetch(`${server.baseUrl}/api/v1/flows/send/message`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': TEST_API_KEY
      },
      body: JSON.stringify({
        to: '5492918888888',
        flowId: 'flow-envio-1',
        flowToken: 'token-envio-flow-123456789',
        cta: 'Completar datos',
        body: 'Completá el formulario.'
      })
    });
    assert.equal(response.status, 201);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const token = await base.consultar(
    `SELECT flow_id, wa_id, status FROM whatsapp_flow_tokens`
  );
  assert.equal(token.rows[0]?.flow_id, 'flow-envio-1');
  assert.equal(token.rows[0]?.wa_id, '5492918888888');
  assert.equal(token.rows[0]?.status, 'ACTIVE');
});
