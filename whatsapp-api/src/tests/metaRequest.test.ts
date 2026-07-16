import test from 'node:test';
import assert from 'node:assert/strict';

process.env.API_KEY = 'clave-de-prueba-con-mas-de-32-caracteres';
process.env.DATABASE_URL = 'postgresql://usuario:clave@localhost:5432/prueba';
process.env.META_GRAPH_VERSION = 'v99.0';
process.env.WHATSAPP_ACCESS_TOKEN = 'token-de-prueba';
process.env.WHATSAPP_PHONE_NUMBER_ID = '123456789';
process.env.META_MAX_RETRIES = '2';
process.env.META_RETRY_BASE_MS = '50';

const { AppError } = await import('../errors/AppError.js');
const { sendText } = await import('../services/meta.js');

function jsonResponse(body: unknown, status: number, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...(extraHeaders ?? {})
    }
  });
}

test('reintenta errores transitorios y devuelve el resultado cuando Meta se recupera', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;
    if (calls < 3) {
      return jsonResponse({ error: { message: 'servicio temporalmente no disponible' } }, 503);
    }
    return jsonResponse({ messages: [{ id: 'wamid.recuperado' }] }, 200);
  }) as typeof fetch;

  try {
    const result = await sendText('5492915550000', 'Prueba');
    assert.equal(calls, 3);
    assert.equal(result.messages?.[0]?.id, 'wamid.recuperado');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('no reintenta un error permanente de Meta', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;
    return jsonResponse({ error: { message: 'solicitud inválida', code: 100 } }, 400);
  }) as typeof fetch;

  try {
    await assert.rejects(
      sendText('5492915550000', 'Prueba'),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.details?.httpStatus, 400);
        assert.equal(error.details?.transient, false);
        assert.equal(error.details?.attempts, 1);
        return true;
      }
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('reintenta una falla de red y luego completa el envío', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) throw new TypeError('fallo de red simulado');
    return jsonResponse({ messages: [{ id: 'wamid.red-recuperada' }] }, 200);
  }) as typeof fetch;

  try {
    const result = await sendText('5492915550000', 'Prueba');
    assert.equal(calls, 2);
    assert.equal(result.messages?.[0]?.id, 'wamid.red-recuperada');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('respeta Retry-After sin exceder el máximo de reintentos', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;
    return jsonResponse(
      { error: { message: 'límite temporal', code: 4 } },
      429,
      { 'retry-after': '0' }
    );
  }) as typeof fetch;

  try {
    await assert.rejects(
      sendText('5492915550000', 'Prueba'),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.details?.httpStatus, 429);
        assert.equal(error.details?.transient, true);
        assert.equal(error.details?.attempts, 3);
        return true;
      }
    );
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
