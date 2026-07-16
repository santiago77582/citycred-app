import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { Server } from 'node:http';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.API_KEY = 'clave-de-prueba-con-mas-de-32-caracteres';
process.env.DATABASE_URL = 'postgresql://usuario:clave@localhost:5432/prueba';
process.env.DATABASE_SSL = 'false';
process.env.META_APP_SECRET = 'secreto-meta-de-prueba';
process.env.WHATSAPP_VERIFY_TOKEN = 'verify-token-de-prueba';

const { createApp } = await import('../app.js');
const { pool } = await import('../db.js');

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test('devuelve 500 si el evento firmado no puede guardarse', async () => {
  const mutablePool = pool as unknown as {
    query: (...args: unknown[]) => Promise<unknown>;
  };
  const originalQuery = mutablePool.query;
  mutablePool.query = async () => {
    throw new Error('fallo de persistencia simulado');
  };

  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');

    const payload = {
      object: 'whatsapp_business_account',
      entry: []
    };
    const body = JSON.stringify(payload);
    const signature = `sha256=${createHmac('sha256', process.env.META_APP_SECRET ?? '')
      .update(body)
      .digest('hex')}`;

    const response = await fetch(`http://127.0.0.1:${address.port}/webhooks/whatsapp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-hub-signature-256': signature
      },
      body
    });

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      received: false,
      error: 'No se pudo procesar el webhook.'
    });
  } finally {
    mutablePool.query = originalQuery;
    await closeServer(server);
    await pool.end();
  }
});
