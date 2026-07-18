import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { applyTestEnv } from './helpers/entornoPruebas.js';
import { prepararBaseEnMemoria } from './helpers/baseEnMemoria.js';

applyTestEnv();
const base = await prepararBaseEnMemoria();
const {
  insertMessage,
  listConversations,
  upsertContact,
  upsertConversation
} = await import('../repository.js');

test.afterEach(() => base.reiniciar());

test('un wamid duplicado conserva una sola fila y repara la fecha de la bandeja', async () => {
  const contact = await upsertContact('5492912222222', 'Duplicado');
  const conversation = await upsertConversation(contact.id);
  const wamid = 'wamid-duplicado-auditoria';
  await insertMessage({
    wamid,
    conversationId: conversation.id,
    direction: 'INBOUND',
    type: 'text',
    text: 'hola',
    status: 'RECEIVED',
    raw: {}
  });

  const stored = await base.consultar(
    `SELECT created_at FROM messages WHERE wamid = $1`,
    [wamid]
  );
  const messageCreatedAt = new Date(String(stored.rows[0]?.created_at)).getTime();
  await base.consultar(
    `UPDATE conversations
     SET last_message_at = '2020-01-01T00:00:00.000Z'
     WHERE id = $1`,
    [conversation.id]
  );

  await insertMessage({
    wamid,
    conversationId: conversation.id,
    direction: 'INBOUND',
    type: 'text',
    text: 'hola repetido',
    status: 'RECEIVED',
    raw: {}
  });

  const messages = await base.consultar(
    `SELECT text FROM messages WHERE wamid = $1`,
    [wamid]
  );
  assert.equal(messages.rows.length, 1);
  assert.equal(messages.rows[0]?.text, 'hola');

  const repaired = await base.consultar(
    `SELECT last_message_at FROM conversations WHERE id = $1`,
    [conversation.id]
  );
  assert.equal(
    new Date(String(repaired.rows[0]?.last_message_at)).getTime(),
    messageCreatedAt
  );
});

test('dos mensajes con la misma fecha producen una sola conversación', async () => {
  const contactId = randomUUID();
  const conversationId = randomUUID();
  await base.consultar(
    `INSERT INTO contacts (id, wa_id, phone, profile_name)
     VALUES ($1, '5492913333333', '5492913333333', 'Empate')`,
    [contactId]
  );
  await base.consultar(
    `INSERT INTO conversations (id, contact_id, last_message_at)
     VALUES ($1, $2, '2026-07-18T12:00:00.000Z')`,
    [conversationId, contactId]
  );
  await base.consultar(
    `INSERT INTO messages (
       id, wamid, conversation_id, direction, type, text, status, raw, created_at, updated_at
     ) VALUES
       ('00000000-0000-4000-8000-000000000001', 'empate-1', $1, 'INBOUND', 'text',
        'primero', 'RECEIVED', '{}'::jsonb, '2026-07-18T12:00:00.000Z', '2026-07-18T12:00:00.000Z'),
       ('00000000-0000-4000-8000-000000000002', 'empate-2', $1, 'INBOUND', 'text',
        'segundo', 'RECEIVED', '{}'::jsonb, '2026-07-18T12:00:00.000Z', '2026-07-18T12:00:00.000Z')`,
    [conversationId]
  );

  const conversations = await listConversations(10);
  assert.equal(conversations.length, 1);
  assert.equal(conversations[0]?.lastMessageText, 'segundo');
});
