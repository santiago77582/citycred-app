import assert from 'node:assert/strict';
import test from 'node:test';
import { CRM_ATTACHMENTS_JS } from '../admin/crmClientAttachments.js';
import { CRM_CAMPAIGNS_JS } from '../admin/crmClientCampaigns.js';
import { CRM_CORE_JS } from '../admin/crmClientCore.js';
import { CRM_IMPORTS_JS } from '../admin/crmClientImports.js';
import { CRM_SETTINGS_JS } from '../admin/crmClientSettings.js';
import { CRM_TEMPLATES_JS } from '../admin/crmClientTemplates.js';
import { CRM_HTML } from '../admin/crmPage.js';

test('la página CRM incluye todos los módulos administrativos', () => {
  for (const id of [
    'contactsView', 'teamView', 'labelsView', 'quickRepliesView',
    'templatesView', 'campaignsView'
  ]) {
    assert.match(CRM_HTML, new RegExp(`id="${id}"`));
  }
  assert.match(CRM_HTML, /Sincronizar con Meta/);
  assert.match(CRM_HTML, /No envía campañas ni mensajes/);
  assert.match(CRM_HTML, /Envío desactivado/);
  assert.match(CRM_HTML, /Importar CSV \/ Excel/);
  assert.match(CRM_HTML, /id="contactImportPanel"/);
  assert.match(CRM_HTML, /\/admin\/assets\/crm\.js/);
  assert.match(CRM_HTML, /CRM y campañas/);
  assert.match(CRM_HTML, /data-admin-only href="\/admin\/platform"/);
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
  assert.match(CRM_TEMPLATES_JS, /\/admin\/api\/templates/);
  assert.match(CRM_TEMPLATES_JS, /\/sync/);
  assert.match(CRM_TEMPLATES_JS, /APPROVED/);
  assert.match(CRM_CAMPAIGNS_JS, /\/admin\/api\/campaigns/);
  assert.match(CRM_IMPORTS_JS, /\/admin\/api\/imports\/preview/);
  assert.match(CRM_IMPORTS_JS, /confirmation: 'IMPORTAR'/);
  assert.doesNotThrow(() => new Function(CRM_IMPORTS_JS));
  assert.doesNotMatch(
    CRM_CORE_JS + CRM_SETTINGS_JS + CRM_ATTACHMENTS_JS +
      CRM_TEMPLATES_JS + CRM_CAMPAIGNS_JS + CRM_IMPORTS_JS,
    /WHATSAPP_ACCESS_TOKEN|META_APP_SECRET|Bearer /i
  );
});
