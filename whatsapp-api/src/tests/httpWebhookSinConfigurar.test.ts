import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { applyTestEnv } from './helpers/entornoPruebas.js';

// Este archivo corre en su propio proceso, así que puede arrancar SIN los
// secretos de Meta para probar el comportamiento "webhook no configurado".
applyTestEnv({ META_APP_SECRET: undefined, WHATSAPP_VERIFY_TOKEN: undefined });

const { prepararBaseEnMemoria } = await import('./helpers/baseEnMemoria.js');
const { iniciarServidorDePruebas, postWebhook } = await import('./helpers/servidorHttp.js');

await prepararBaseEnMemoria();

let baseUrl = '';
let cerrar: () => Promise<void> = async () => {};

before(async () => {
  const servidor = await iniciarServidorDePruebas();
  baseUrl = servidor.baseUrl;
  cerrar = servidor.cerrar;
});

after(async () => {
  await cerrar();
});

test('POST /webhooks/whatsapp responde 503 si falta META_APP_SECRET', async () => {
  const cuerpo = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
  const res = await postWebhook(baseUrl, cuerpo, 'sha256=' + '0'.repeat(64));
  const body = (await res.json()) as Record<string, unknown>;

  assert.equal(res.status, 503);
  assert.match(String(body.error), /META_APP_SECRET/);
});

test('GET /webhooks/whatsapp rechaza la verificación si no hay verify token configurado', async () => {
  const query = new URLSearchParams({
    'hub.mode': 'subscribe',
    'hub.verify_token': 'cualquiera',
    'hub.challenge': 'desafio'
  });
  const res = await fetch(`${baseUrl}/webhooks/whatsapp?${query.toString()}`);
  assert.equal(res.status, 403);
});

test('GET /health informa que el webhook de Meta no está configurado', async () => {
  const res = await fetch(`${baseUrl}/health`);
  const body = (await res.json()) as {
    meta?: { webhookConfigurado?: boolean; faltantes?: string[]; variables?: Record<string, boolean> };
    safety?: {
      safeMode?: boolean;
      features?: Record<string, boolean | null>;
    };
  };

  assert.equal(res.status, 200);
  assert.equal(body.meta?.webhookConfigurado, false);
  assert.ok(body.meta?.faltantes?.includes('META_APP_SECRET'));
  assert.ok(Object.values(body.meta?.variables ?? {}).every((configured) => !configured));
  assert.equal(body.safety?.safeMode, true);
  assert.deepEqual(body.safety?.features, {
    botEnabled: false,
    followupsEnabled: false,
    campaignExecutionEnabled: false,
    flowEndpointEnabled: false,
    operationsSchedulerEnabled: false,
    backupSchedulerEnabled: false,
    backupRestoreTestEnabled: false
  });
});
