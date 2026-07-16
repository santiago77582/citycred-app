import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { isValidMetaSignature } from '../middleware/metaSignature.js';

const secret = 'secreto-de-prueba';
const body = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account' }));

test('acepta una firma válida de Meta', () => {
  const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  assert.equal(isValidMetaSignature(body, signature, secret), true);
});

test('rechaza una firma incorrecta', () => {
  assert.equal(isValidMetaSignature(body, `sha256=${'0'.repeat(64)}`, secret), false);
});

test('rechaza una firma calculada con otro secreto', () => {
  const signature = `sha256=${createHmac('sha256', 'otro-secreto').update(body).digest('hex')}`;
  assert.equal(isValidMetaSignature(body, signature, secret), false);
});

test('rechaza encabezados ausentes o malformados', () => {
  assert.equal(isValidMetaSignature(body, undefined, secret), false);
  assert.equal(isValidMetaSignature(body, 'md5=abc', secret), false);
  assert.equal(isValidMetaSignature(body, 'sha256=no-es-hexadecimal', secret), false);
  assert.equal(isValidMetaSignature(undefined, 'sha256=abc', secret), false);
});
