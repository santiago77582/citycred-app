import assert from 'node:assert/strict';
import test from 'node:test';
import { ANALYTICS_UI_CSS } from '../admin/analyticsUiStyle.js';
import { CRM_ANALYTICS_JS } from '../admin/crmClientAnalytics.js';
import { CRM_HTML } from '../admin/crmPage.js';

test('el cliente de estadísticas contiene JavaScript válido', () => {
  assert.doesNotThrow(() => new Function(CRM_ANALYTICS_JS));
});

test('la pantalla incluye períodos, indicadores y paneles operativos', () => {
  assert.match(CRM_HTML, /id="analyticsView"/);
  assert.match(CRM_HTML, /value="7"/);
  assert.match(CRM_HTML, /value="30"/);
  assert.match(CRM_HTML, /value="90"/);
  assert.match(CRM_HTML, /value="365"/);
  for (const id of [
    'analyticsKpis', 'analyticsDailyChart', 'analyticsConsent',
    'analyticsMessageStatus', 'analyticsEntities', 'analyticsCommercialStatus',
    'analyticsOperations'
  ]) {
    assert.match(CRM_HTML, new RegExp(`id="${id}"`));
  }
});

test('la interfaz consulta una ruta protegida y no realiza escrituras', () => {
  assert.match(CRM_ANALYTICS_JS, /\/admin\/api\/analytics\/dashboard\?days=/);
  assert.match(CRM_ANALYTICS_JS, /credentials: 'same-origin'/);
  assert.doesNotMatch(CRM_ANALYTICS_JS, /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i);
  assert.doesNotMatch(CRM_ANALYTICS_JS, /WHATSAPP_ACCESS_TOKEN|META_APP_SECRET|Bearer /i);
});

test('muestra entregas, respuestas, alertas y límites de lectura', () => {
  assert.match(CRM_ANALYTICS_JS, /deliveryRatePercent/);
  assert.match(CRM_ANALYTICS_JS, /averageMinutes/);
  assert.match(CRM_ANALYTICS_JS, /criticalOpen/);
  assert.match(CRM_ANALYTICS_JS, /messagesTruncated/);
  assert.match(CRM_ANALYTICS_JS, /contactsTruncated/);
  assert.match(CRM_ANALYTICS_JS, /conversationsTruncated/);
});

test('los estilos son adaptables a escritorio y celular', () => {
  assert.match(ANALYTICS_UI_CSS, /\.analytics-kpis/);
  assert.match(ANALYTICS_UI_CSS, /\.analytics-day-columns/);
  assert.match(ANALYTICS_UI_CSS, /\.analytics-operation-grid/);
  assert.match(ANALYTICS_UI_CSS, /@media \(max-width: 720px\)/);
});
