import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTestEnv } from './helpers/entornoPruebas.js';

applyTestEnv();

const { sanitizeInboundMessage, sanitizeWebhookPayload } = await import('../security/webhookSanitizer.js');
const { attachmentFrom, mapStatus, messageText } = await import('../services/webhookProcessor.js');
const { pool } = await import('../db.js');
const { insertMessageAttachment, recordMessageMilestone, registerInboundActivity } = await import('../platformRepository.js');

test('redacta datos sensibles antes de guardar el evento o mensaje', () => {
  const payload = {
    entry: [{ changes: [{ value: { messages: [{
      type: 'text',
      text: { body: 'usuario: cliente01 contraseña: ejemplo789' }
    }] } }] }]
  };
  const safe = sanitizeWebhookPayload(payload);
  const serialized = JSON.stringify(safe);
  assert.equal(serialized.includes('cliente01'), false);
  assert.equal(serialized.includes('ejemplo789'), false);
  assert.match(serialized, /OCULTO/);

  const inbound = sanitizeInboundMessage(payload.entry[0]!.changes[0]!.value.messages[0]!);
  assert.equal(inbound.blocked, true);
  assert.match(messageText(inbound.message) ?? '', /OCULTO/);
});

test('extrae metadatos de imágenes, documentos y notas de voz', () => {
  assert.deepEqual(attachmentFrom({
    type: 'image',
    image: { id: 'media-1', mime_type: 'image/jpeg', caption: 'Recibo' }
  }), {
    mediaId: 'media-1',
    mediaType: 'IMAGE',
    mimeType: 'image/jpeg',
    filename: null,
    caption: 'Recibo'
  });

  assert.equal(attachmentFrom({
    type: 'audio',
    audio: { id: 'audio-1', mime_type: 'audio/ogg', voice: true }
  })?.mediaType, 'VOICE');

  assert.equal(attachmentFrom({
    type: 'document',
    document: { id: 'doc-1', filename: 'archivo.pdf' }
  })?.filename, 'archivo.pdf');
});

test('normaliza estados de Meta para las tildes del panel', () => {
  assert.equal(mapStatus('sent'), 'SENT');
  assert.equal(mapStatus('delivered'), 'DELIVERED');
  assert.equal(mapStatus('read'), 'READ');
  assert.equal(mapStatus('failed'), 'FAILED');
});

test('genera consultas para actividad, adjuntos e hitos reales', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  (pool as unknown as { query: (sql: string, params?: unknown[]) => Promise<unknown> }).query = async (
    sql: string,
    params: unknown[] = []
  ) => {
    calls.push({ sql, params });
    return sql.includes('RETURNING id') ? { rows: [{ id: 'attachment-1' }], rowCount: 1 } : { rows: [], rowCount: 1 };
  };

  await registerInboundActivity('conversation-1');
  const attachmentId = await insertMessageAttachment({
    messageId: 'message-1',
    mediaId: 'media-1',
    mediaType: 'IMAGE',
    mimeType: 'image/jpeg',
    filename: null,
    caption: 'Recibo'
  });
  await recordMessageMilestone('wamid-1', 'READ');

  assert.equal(attachmentId, 'attachment-1');
  assert.match(calls[0]?.sql ?? '', /unread_count = unread_count \+ 1/);
  assert.match(calls[1]?.sql ?? '', /message_attachments/);
  assert.match(calls[2]?.sql ?? '', /delivered_at/);
  assert.deepEqual(calls[2]?.params, ['wamid-1', 'READ']);
});
