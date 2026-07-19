import assert from 'node:assert/strict';
import test from 'node:test';
import { PLATFORM_CORE_JS } from '../admin/platformClientCore.js';
import { PLATFORM_BOT_JS } from '../admin/platformClientBot.js';
import { PLATFORM_ACCOUNT_JS } from '../admin/platformClientAccount.js';
import { PLATFORM_FLOWS_JS } from '../admin/platformClientFlows.js';
import { PLATFORM_INIT_JS, PLATFORM_NAV_JS } from '../admin/platformClientInit.js';
import { PLATFORM_HTML } from '../admin/platformPage.js';

test('todo el JavaScript del panel integral tiene sintaxis válida', () => {
  assert.doesNotThrow(() => new Function([
    PLATFORM_CORE_JS,
    PLATFORM_BOT_JS,
    PLATFORM_ACCOUNT_JS,
    PLATFORM_FLOWS_JS,
    PLATFORM_INIT_JS,
    PLATFORM_NAV_JS
  ].join('\n')));
});

test('la pantalla contiene todos los módulos administrativos', () => {
  for (const text of [
    'Bot y seguimientos',
    'Cuenta y perfil',
    'Catálogo y productos',
    'WhatsApp Flows',
    'Métricas oficiales de Meta',
    'Simular sin enviar'
  ]) {
    assert.match(PLATFORM_HTML, new RegExp(text));
  }
  assert.match(PLATFORM_HTML, /Guardar con confirmación/);
  assert.match(PLATFORM_HTML, /Nada se activa solo/);
});

test('los clientes visuales usan rutas protegidas de la misma aplicación', () => {
  const code = [PLATFORM_BOT_JS, PLATFORM_ACCOUNT_JS, PLATFORM_FLOWS_JS].join('\n');
  assert.match(code, /\/admin\/api\/platform/);
  assert.doesNotMatch(code, /graph\.facebook\.com/);
  assert.doesNotMatch(code, /Authorization:\s*Bearer/i);
});
