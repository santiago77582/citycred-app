import assert from 'node:assert/strict';
import test from 'node:test';
import { CRM_ATTACHMENTS_JS } from '../admin/crmClientAttachments.js';
import { CRM_CORE_JS } from '../admin/crmClientCore.js';
import { CRM_SETTINGS_JS } from '../admin/crmClientSettings.js';
import { CRM_HTML } from '../admin/crmPage.js';

test('la página CRM incluye clientes, equipo, etiquetas y respuestas rápidas', () => {
  for (const id of ['contactsView', 'teamView', 'labelsView', 'quickRepliesView']) {
    assert.match(CRM_HTML, new RegExp(`id="${id}"`));
  }
  assert.match(CRM_HTML, /\/admin\/assets\/crm\.js/);
});

test('el cliente CRM usa únicamente rutas protegidas del panel', () => {
  assert.match(CRM_CORE_JS, /\/admin\/api\/crm/);
  assert.match(CRM_SETTINGS_JS, /\/users/);
  assert.match(CRM_SETTINGS_JS, /\/labels/);
  assert.match(CRM_SETTINGS_JS, /\/quick-replies/);
  assert.match(CRM_ATTACHMENTS_JS, /\/admin\/api\/media/);
  assert.match(CRM_ATTACHMENTS_JS, /attachment\.mediaType === 'IMAGE'/);
  assert.match(CRM_ATTACHMENTS_JS, /<audio/);
  assert.match(CRM_ATTACHMENTS_JS, /<video/);
  assert.doesNotMatch(
    CRM_CORE_JS + CRM_SETTINGS_JS + CRM_ATTACHMENTS_JS,
    /WHATSAPP_ACCESS_TOKEN|META_APP_SECRET/
  );
});
