import assert from 'node:assert/strict';
import test from 'node:test';
import { CAMPAIGN_UI_CSS } from '../admin/campaignUiStyle.js';
import { CRM_CAMPAIGNS_JS } from '../admin/crmClientCampaigns.js';
import { CRM_HTML } from '../admin/crmPage.js';

test('el cliente de campañas contiene JavaScript válido', () => {
  assert.doesNotThrow(() => new Function(CRM_CAMPAIGNS_JS));
});

test('la interfaz solo crea borradores y vistas previas', () => {
  assert.match(CRM_CAMPAIGNS_JS, /\/preview/);
  assert.match(CRM_CAMPAIGNS_JS, /\/recipients\?status=/);
  assert.match(CRM_CAMPAIGNS_JS, /Guardar borrador/);
  assert.match(CRM_CAMPAIGNS_JS, /No se envió ningún mensaje/);
  assert.doesNotMatch(CRM_CAMPAIGNS_JS, /\/execute/);
  assert.doesNotMatch(CRM_HTML, /Enviar campaña/);
});

test('la interfaz muestra habilitados, excluidos y motivos', () => {
  assert.match(CRM_CAMPAIGNS_JS, /CONSENT_NOT_GRANTED/);
  assert.match(CRM_CAMPAIGNS_JS, /DO_NOT_CONTACT/);
  assert.match(CRM_CAMPAIGNS_JS, /INVALID_PHONE/);
  assert.match(CRM_CAMPAIGNS_JS, /campaignReadyRecipients/);
  assert.match(CRM_CAMPAIGNS_JS, /campaignSkippedRecipients/);
  assert.match(CAMPAIGN_UI_CSS, /\.campaign-metrics/);
  assert.match(CAMPAIGN_UI_CSS, /\.campaign-recipient-row/);
});

test('omite plantillas con encabezado multimedia en campañas', () => {
  assert.match(CRM_CAMPAIGNS_JS, /filter\(function \(template\) \{ return !mediaHeader\(template\); \}\)/);
});
