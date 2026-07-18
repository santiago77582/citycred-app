import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeInboundMessage, sanitizeWebhookPayload } from '../security/webhookSanitizer.js';
import { attachmentFrom, mapStatus, messageText } from '../services/webhookMessage.js';

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
