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

test('un wamid duplicado no vuelve a mover la conversación', async () => {
  const contact = await upsertContact('5492912222222', 'Duplicado');
  const conversation = await upsertConversation(contact.id);
  const wamid = 'wamid-duplicado-auditoria';
  const first = await insertMessage({
    wamid,
    conversationId: conversation.id,
    direction: 'INBOUND',
    type: 'text',
    text: 'hola',
    status: 'RECEIVED',
    raw: {}
  });
  assert.ok(first);
  const before = await base.consultar(
    `SELECT last_message_at, updated_at FROM conversations WHERE id = $1`,
    [conversation.id]
  );

  await new Promise((resolve) => setTimeout(resolve, 10));
  const duplicate = await insertMessage({
    wamid,
    conversationId: conversation.id,
    direction: 'INBOUND',
    type: 'text',
    text: 'hola repetido',
    status: 'RECEIVED',
    raw: {}
  });
  assert.equal(duplicate, null);
  const after = await base.consultar(
    `SELECT last_message_at, updated_at FROM conversations WHERE id = $1`,
    [conversation.id]
  );
  assert.equal(
    new Date(String(after.rows[0]?.last_message_at)).getTime(),
    new Date(String(before.rows[0]?.last_message_at)).getTime()
  );
  assert.equal(
    new Date(String(after.rows[0]?.updated_at)).getTime(),
    new Date(String(before.rows[0]?.updated_at)).getTime()
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
