import assert from 'node:assert/strict';
import test from 'node:test';
import { CRM_TEMPLATES_JS } from '../admin/crmClientTemplates.js';
import { TEMPLATE_COMPOSER_JS } from '../admin/templateComposer.js';
import { TEMPLATE_UI_CSS } from '../admin/templateUiStyle.js';

test('los clientes web de plantillas tienen JavaScript válido', () => {
  assert.doesNotThrow(() => new Function(CRM_TEMPLATES_JS));
  assert.doesNotThrow(() => new Function(TEMPLATE_COMPOSER_JS));
});

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

test('carga encabezados multimedia antes de habilitar el envío', () => {
  assert.match(TEMPLATE_COMPOSER_JS, /\/header-media/);
  assert.match(TEMPLATE_COMPOSER_JS, /format === 'IMAGE'/);
  assert.match(TEMPLATE_COMPOSER_JS, /format === 'VIDEO'/);
  assert.match(TEMPLATE_COMPOSER_JS, /format === 'DOCUMENT'/);
  assert.match(TEMPLATE_COMPOSER_JS, /mediaReady = !mediaInfo \|\| Boolean\(headerMedia\)/);
  assert.match(TEMPLATE_COMPOSER_JS, /mediaParameter\[headerMedia\.kind\] = mediaValue/);
  assert.match(TEMPLATE_COMPOSER_JS, /mediaValue\.filename = headerMedia\.filename/);
  assert.match(TEMPLATE_UI_CSS, /\.template-header-upload/);
  assert.match(TEMPLATE_UI_CSS, /\.template-upload-status\.ready/);
});

test('muestra la advertencia de costo antes de enviar', () => {
  assert.match(TEMPLATE_COMPOSER_JS, /puede generar cargos de Meta/);
});
