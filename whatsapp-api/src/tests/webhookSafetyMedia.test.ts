import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { newDb } from 'pg-mem';
import { applyTestEnv } from './helpers/entornoPruebas.js';

applyTestEnv();

const { pool } = await import('../db.js');
const db = newDb();
const sqlDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../sql');
for (const migration of readdirSync(sqlDir).filter((name) => /^\d+_.*\.sql$/i.test(name)).sort()) {
  db.public.none(readFileSync(path.join(sqlDir, migration), 'utf8'));
}
const { Pool } = db.adapters.createPg();
const memoryPool = new Pool();
(pool as unknown as { query: typeof memoryPool.query }).query = memoryPool.query.bind(memoryPool);
const backup = db.backup();
const query = (sql: string) => memoryPool.query(sql);

const { processWebhook } = await import('../services/webhookProcessor.js');
const { insertMessage, upsertContact, upsertConversation } = await import('../repository.js');

test('redacta datos sensibles antes de guardar el evento y el mensaje', async () => {
  backup.restore();
  await processWebhook({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: {
      contacts: [{ wa_id: '5492910000001', profile: { name: 'Prueba' } }],
      messages: [{
        id: 'wamid-sensitive-1',
        from: '5492910000001',
        type: 'text',
        text: { body: 'usuario: cliente01 contraseña: ejemplo789' }
      }]
    } }] }]
  });

  const messages = await query(`SELECT text, raw FROM messages WHERE wamid = 'wamid-sensitive-1'`);
  const storedText = String(messages.rows[0]?.text ?? '');
  const storedRaw = JSON.stringify(messages.rows[0]?.raw ?? {});
  assert.equal(storedText.includes('cliente01'), false);
  assert.equal(storedText.includes('ejemplo789'), false);
  assert.match(storedText, /\[OCULTO\]/);
  assert.equal(storedRaw.includes('cliente01'), false);
  assert.equal(storedRaw.includes('ejemplo789'), false);

  const events = await query('SELECT payload FROM webhook_events');
  const eventPayload = JSON.stringify(events.rows[0]?.payload ?? {});
  assert.equal(eventPayload.includes('cliente01'), false);
  assert.equal(eventPayload.includes('ejemplo789'), false);
});

test('registra imagen y actividad entrante una sola vez', async () => {
  backup.restore();
  const payload = {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: {
      contacts: [{ wa_id: '5492910000002', profile: { name: 'Foto' } }],
      messages: [{
        id: 'wamid-image-1',
        from: '5492910000002',
        type: 'image',
        image: { id: 'media-image-1', mime_type: 'image/jpeg', caption: 'Recibo de sueldo' }
      }]
    } }] }]
  };

  await processWebhook(payload);
  await processWebhook(payload);

  const attachments = await query(
    `SELECT media_type, mime_type, caption FROM message_attachments WHERE media_id = 'media-image-1'`
  );
  assert.equal(attachments.rows.length, 1);
  assert.equal(attachments.rows[0]?.media_type, 'IMAGE');
  assert.equal(attachments.rows[0]?.caption, 'Recibo de sueldo');

  const conversations = await query(
    `SELECT unread_count FROM conversations c
     JOIN contacts ct ON ct.id = c.contact_id
     WHERE ct.wa_id = '5492910000002'`
  );
  assert.equal(Number(conversations.rows[0]?.unread_count), 1);
});

test('guarda hitos reales enviado, entregado y leído', async () => {
  backup.restore();
  const contact = await upsertContact('5492910000003', 'Estados');
  const conversation = await upsertConversation(contact.id);
  await insertMessage({
    wamid: 'wamid-outbound-1',
    conversationId: conversation.id,
    direction: 'OUTBOUND',
    type: 'text',
    text: 'Prueba',
    status: 'PENDING',
    raw: {}
  });

  for (const status of ['sent', 'delivered', 'read']) {
    await processWebhook({
      entry: [{ changes: [{ value: { statuses: [{ id: 'wamid-outbound-1', status }] } }] }]
    });
  }

  const result = await query(
    `SELECT status, sent_at, delivered_at, read_at FROM messages WHERE wamid = 'wamid-outbound-1'`
  );
  assert.equal(result.rows[0]?.status, 'READ');
  assert.ok(result.rows[0]?.sent_at);
  assert.ok(result.rows[0]?.delivered_at);
  assert.ok(result.rows[0]?.read_at);
});
