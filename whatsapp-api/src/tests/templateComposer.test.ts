import assert from 'node:assert/strict';
import test from 'node:test';
import { TEMPLATE_COMPOSER_JS } from '../admin/templateComposer.js';
import { TEMPLATE_UI_CSS } from '../admin/templateUiStyle.js';

test('el selector consulta solo plantillas aprobadas', () => {
  assert.match(TEMPLATE_COMPOSER_JS, /\?status=APPROVED&limit=500/);
  assert.match(TEMPLATE_COMPOSER_JS, /\/admin\/api\/templates/);
  assert.match(TEMPLATE_COMPOSER_JS, /credentials: 'same-origin'/);
});

test('construye variables de encabezado, cuerpo y botones URL', () => {
  assert.match(TEMPLATE_COMPOSER_JS, /variableNumbers/);
  assert.match(TEMPLATE_COMPOSER_JS, /component: 'header'/);
  assert.match(TEMPLATE_COMPOSER_JS, /component: 'body'/);
  assert.match(TEMPLATE_COMPOSER_JS, /sub_type: 'url'/);
  assert.match(TEMPLATE_COMPOSER_JS, /parameters:/);
});

test('bloquea plantillas con encabezado multimedia incompleto', () => {
  assert.match(TEMPLATE_COMPOSER_JS, /\['IMAGE', 'VIDEO', 'DOCUMENT'\]/);
  assert.match(TEMPLATE_COMPOSER_JS, /sendButton\.disabled = hasMediaHeader/);
  assert.match(TEMPLATE_COMPOSER_JS, /necesita un archivo en el encabezado/);
  assert.match(TEMPLATE_UI_CSS, /\.template-blocked/);
});

test('muestra la advertencia de costo antes de enviar', () => {
  assert.match(TEMPLATE_COMPOSER_JS, /puede generar cargos de Meta/);
});
