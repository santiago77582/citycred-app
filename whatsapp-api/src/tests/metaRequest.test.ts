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
const { markAsRead, sendText } = await import('../services/meta.js');

function jsonResponse(body: unknown, status: number, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...(extraHeaders ?? {})
    }
  });
}

test('reintenta una operación idempotente cuando Meta devuelve un error transitorio', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;
    if (calls < 3) {
      return jsonResponse({ error: { message: 'servicio temporalmente no disponible' } }, 503);
    }
    return jsonResponse({ success: true }, 200);
  }) as typeof fetch;

  try {
    const result = await markAsRead('wamid.entrada');
    assert.equal(calls, 3);
    assert.deepEqual(result, { success: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('no reintenta el envío si Meta devuelve 5xx para evitar mensajes duplicados', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;
    return jsonResponse({ error: { message: 'error temporal' } }, 503);
  }) as typeof fetch;

  try {
    await assert.rejects(
      sendText('5492915550000', 'Prueba'),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.details?.httpStatus, 503);
        assert.equal(error.details?.transient, true);
        assert.equal(error.details?.deliveryUnknown, true);
        assert.equal(error.details?.attempts, 1);
        return true;
      }
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('no reintenta un envío con falla de red y marca el resultado como desconocido', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;
    throw new TypeError('fallo de red simulado');
  }) as typeof fetch;

  try {
    await assert.rejects(
      sendText('5492915550000', 'Prueba'),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.details?.transient, true);
        assert.equal(error.details?.deliveryUnknown, true);
        assert.equal(error.details?.attempts, 1);
        return true;
      }
    );
    assert.equal(calls, 1);
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
        assert.equal(error.details?.deliveryUnknown, false);
        assert.equal(error.details?.attempts, 1);
        return true;
      }
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('respeta Retry-After en operaciones idempotentes sin exceder el máximo', async () => {
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
      markAsRead('wamid.entrada'),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.details?.httpStatus, 429);
        assert.equal(error.details?.transient, true);
        assert.equal(error.details?.deliveryUnknown, false);
        assert.equal(error.details?.attempts, 3);
        return true;
      }
    );
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
