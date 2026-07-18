import assert from 'node:assert/strict';
import test from 'node:test';
import { applyTestEnv } from './helpers/entornoPruebas.js';

applyTestEnv({
  META_GRAPH_VERSION: 'v23.0',
  WHATSAPP_ACCESS_TOKEN: 'token-solo-pruebas',
  WHATSAPP_PHONE_NUMBER_ID: '123456789'
});

const {
  isAllowedMetaMediaUrl,
  openMetaMediaDownload,
  retrieveMetaMediaInfo
} = await import('../services/metaMedia.js');

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
