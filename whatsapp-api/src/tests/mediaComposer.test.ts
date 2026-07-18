import assert from 'node:assert/strict';
import test from 'node:test';
import { MEDIA_COMPOSER_JS } from '../admin/mediaComposer.js';
import { MEDIA_COMPOSER_CSS } from '../admin/mediaComposerStyle.js';

test('el panel envía archivos únicamente mediante la ruta protegida', () => {
  assert.match(MEDIA_COMPOSER_JS, /\/admin\/api\/media\/outbound\//);
  assert.match(MEDIA_COMPOSER_JS, /credentials: 'same-origin'/);
  assert.match(MEDIA_COMPOSER_JS, /x-citycred-filename/);
  assert.match(MEDIA_COMPOSER_JS, /x-citycred-caption/);
  assert.doesNotMatch(MEDIA_COMPOSER_JS, /WHATSAPP_ACCESS_TOKEN|META_APP_SECRET|Bearer /);
});

test('el selector aplica límites antes de iniciar la carga', () => {
  assert.match(MEDIA_COMPOSER_JS, /'image\/jpeg': \{ max: 5000000/);
  assert.match(MEDIA_COMPOSER_JS, /'audio\/mpeg': \{ max: 16000000/);
  assert.match(MEDIA_COMPOSER_JS, /'application\/pdf': \{ max: 100000000/);
  assert.match(MEDIA_COMPOSER_JS, /file\.size > rule\.max/);
  assert.match(MEDIA_COMPOSER_CSS, /\.media-modal/);
});
