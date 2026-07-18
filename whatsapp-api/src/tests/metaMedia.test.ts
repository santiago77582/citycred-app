import assert from 'node:assert/strict';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { applyTestEnv } from './helpers/entornoPruebas.js';

applyTestEnv({
  META_GRAPH_VERSION: 'v23.0',
  WHATSAPP_ACCESS_TOKEN: 'token-solo-pruebas',
  WHATSAPP_PHONE_NUMBER_ID: '123456789',
  META_MEDIA_TIMEOUT_MS: '120000'
});

const {
  isAllowedMetaMediaUrl,
  openMetaMediaDownload,
  resolveOutboundMediaSpec,
  retrieveMetaMediaInfo,
  sendMetaMediaMessage,
  uploadMetaMedia
} = await import('../services/metaMedia.js');

test('clasifica formatos y aplica los límites oficiales', () => {
  const image = resolveOutboundMediaSpec('image/jpeg');
  assert.equal(image.kind, 'image');
  assert.equal(image.maxBytes, 5_000_000);
  assert.equal(image.allowsCaption, true);

  const audio = resolveOutboundMediaSpec('audio/ogg; codecs=opus');
  assert.equal(audio.kind, 'audio');
  assert.equal(audio.maxBytes, 16_000_000);
  assert.equal(audio.allowsCaption, false);

  const document = resolveOutboundMediaSpec('application/pdf');
  assert.equal(document.kind, 'document');
  assert.equal(document.maxBytes, 100_000_000);

  assert.throws(() => resolveOutboundMediaSpec('application/x-msdownload'), /no está permitido/i);
});

test('solo permite direcciones HTTPS de infraestructura autorizada', () => {
  assert.equal(isAllowedMetaMediaUrl('https://lookaside.fbsbx.com/archivo'), true);
  assert.equal(isAllowedMetaMediaUrl('https://graph.facebook.com/archivo'), true);
  assert.equal(isAllowedMetaMediaUrl('https://subdominio.fbcdn.net/archivo'), true);
  assert.equal(isAllowedMetaMediaUrl('http://lookaside.fbsbx.com/archivo'), false);
  assert.equal(isAllowedMetaMediaUrl('https://lookaside.fbsbx.com.ejemplo.com/archivo'), false);
  assert.equal(isAllowedMetaMediaUrl('https://usuario:clave@lookaside.fbsbx.com/archivo'), false);
});

test('consulta el archivo por ID y descarga el contenido con autorización del servidor', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (calls.length === 1) {
      return new Response(JSON.stringify({
        url: 'https://lookaside.fbsbx.com/whatsapp_business/archivo',
        mime_type: 'image/jpeg',
        file_size: 4,
        id: 'media-1'
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    return new Response(new Uint8Array([1, 2, 3, 4]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg', 'content-length': '4' }
    });
  };

  try {
    const opened = await openMetaMediaDownload('media-1');
    assert.equal(opened.info.mime_type, 'image/jpeg');
    assert.deepEqual(Array.from(new Uint8Array(await opened.response.arrayBuffer())), [1, 2, 3, 4]);
    assert.match(calls[0]?.url ?? '', /\/v23\.0\/media-1\?phone_number_id=123456789/);
    assert.equal(calls[1]?.url, 'https://lookaside.fbsbx.com/whatsapp_business/archivo');
    for (const call of calls) {
      const headers = new Headers(call.init?.headers);
      assert.equal(headers.get('authorization'), 'Bearer token-solo-pruebas');
      assert.equal(call.init?.redirect, 'error');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sube un archivo y luego envía el media_id sin exponer el contenido en JSON', async () => {
  const originalFetch = globalThis.fetch;
  const path = join(tmpdir(), `citycred-meta-media-${Date.now()}.jpg`);
  await writeFile(path, new Uint8Array([1, 2, 3]));
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (calls.length === 1) {
      const form = init?.body as FormData;
      assert.equal(form.get('messaging_product'), 'whatsapp');
      const file = form.get('file');
      assert.ok(file instanceof Blob);
      return new Response(JSON.stringify({ id: 'media-upload-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    const payload = JSON.parse(String(init?.body));
    assert.equal(payload.type, 'image');
    assert.equal(payload.image.id, 'media-upload-1');
    assert.equal(payload.image.caption, 'Comprobante');
    assert.equal(payload.to, '5492910000000');
    return new Response(JSON.stringify({ messages: [{ id: 'wamid.media.1' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const upload = await uploadMetaMedia({
      filePath: path,
      mimeType: 'image/jpeg',
      filename: 'comprobante.jpg'
    });
    assert.equal(upload.id, 'media-upload-1');
    const sent = await sendMetaMediaMessage({
      to: '5492910000000',
      kind: 'image',
      mediaId: upload.id,
      caption: 'Comprobante',
      filename: null
    });
    assert.equal(sent.messages?.[0]?.id, 'wamid.media.1');
    assert.match(calls[0]?.url ?? '', /\/v23\.0\/123456789\/media$/);
    assert.match(calls[1]?.url ?? '', /\/v23\.0\/123456789\/messages$/);
    for (const call of calls) {
      const headers = new Headers(call.init?.headers);
      assert.equal(headers.get('authorization'), 'Bearer token-solo-pruebas');
    }
  } finally {
    globalThis.fetch = originalFetch;
    await unlink(path).catch(() => undefined);
  }
});

test('rechaza una dirección inesperada aunque la respuesta de Meta sea exitosa', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    url: 'https://sitio-no-autorizado.example/archivo',
    file_size: 10
  }), { status: 200, headers: { 'content-type': 'application/json' } });

  try {
    await assert.rejects(
      () => retrieveMetaMediaInfo('media-2'),
      /dirección de archivo no permitida/i
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
