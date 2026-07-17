import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeRequestUrl } from '../utils/logger.js';

test('oculta hub.verify_token sin eliminar los demás parámetros', () => {
  const secreto = 'verify-token-super-secreto';
  const url =
    `/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${secreto}` +
    '&hub.challenge=prueba123';

  const sanitizada = sanitizeRequestUrl(url);

  assert.equal(
    sanitizada,
    '/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=OCULTO&hub.challenge=prueba123'
  );
  assert.doesNotMatch(sanitizada, new RegExp(secreto));
});

test('oculta access_token y token aunque usen mayúsculas', () => {
  const sanitizada = sanitizeRequestUrl(
    '/callback?ACCESS_TOKEN=abc123&token=def456&estado=ok'
  );

  assert.equal(sanitizada, '/callback?ACCESS_TOKEN=OCULTO&token=OCULTO&estado=ok');
  assert.doesNotMatch(sanitizada, /abc123|def456/);
});

test('deja intacta una URL sin parámetros sensibles', () => {
  const url = '/health?detalle=1';
  assert.equal(sanitizeRequestUrl(url), url);
});
