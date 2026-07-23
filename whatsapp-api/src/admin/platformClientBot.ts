export const PLATFORM_BOT_JS = String.raw`
(function () {
  'use strict';
  var P = window.CityCredPlatform;
  var E = P.element;
  var V = P.value;

  function listItem(title, value) {
    return '<div class="list-item"><strong>' + P.escapeHtml(title) + '</strong><div class="muted">' + P.escapeHtml(value == null ? 'Sin información' : value) + '</div></div>';
  }

  async function loadOverview() {
    var results = await Promise.allSettled([
      P.api('/bot/status'),
      P.api('/account/phone-number'),
      P.api('/account/state'),
      P.api('/meta-analytics/capabilities'),
      P.api('/meta-analytics/waba')
    ]);
    var bot = results[0].status === 'fulfilled' ? results[0].value.settings : null;
    var phone = results[1].status === 'fulfilled' ? results[1].value.phoneNumber : null;
    var state = results[2].status === 'fulfilled' ? results[2].value.state : null;
    var capabilities = results[3].status === 'fulfilled' ? results[3].value : null;
    var waba = results[4].status === 'fulfilled' ? results[4].value.waba : null;
    E('overviewKpis').innerHTML = [
      ['Bot', bot ? (bot.botEnabled ? 'Activo' : 'Apagado') : 'Sin datos'],
      ['Seguimientos', bot ? (bot.followupsEnabled ? 'Activos' : 'Apagados') : 'Sin datos'],
      ['Calidad', phone && phone.quality_rating ? phone.quality_rating : 'Sin datos'],
      ['Cuenta', waba && waba.account_review_status ? waba.account_review_status : 'Sin datos']
    ].map(function (item) {
      return '<div class="kpi"><span>' + P.escapeHtml(item[0]) + '</span><strong>' + P.escapeHtml(item[1]) + '</strong></div>';
    }).join('');
    E('overviewMetaState').innerHTML = [
      listItem('Nombre aprobado', phone && phone.verified_name),
      listItem('Número', phone && phone.display_phone_number),
      listItem('Límite reciente', state && state.quality && state.quality.currentLimit),
      listItem('Moneda', waba && waba.currency)
    ].join('');
    E('overviewCapabilities').innerHTML = capabilities ? [
      listItem('Mensajes y conversaciones', capabilities.messageAnalytics && capabilities.conversationAnalytics ? 'Disponibles' : 'No disponibles'),
      listItem('Métricas de Flows', capabilities.flowMetrics ? 'Disponibles' : 'No disponibles'),
      listItem('Costos', capabilities.costPolicy && capabilities.costPolicy.estimatesGenerated === false ? 'Solo valores oficiales de Meta' : 'Revisar configuración'),
      listItem('Fuente', capabilities.source)
    ].join('') : listItem('Meta', 'No se pudieron leer las capacidades');
  }

  async function loadFollowups() {
    var query = new URLSearchParams({ limit: '150' });
    if (V('followupStatusFilter')) query.set('status', V('followupStatusFilter'));
    var data = await P.api('/bot/followups?' + query.toString());
    E('followupsTable').innerHTML = P.rowsTable([
      { label: 'Cliente', render: function (row) { return row.profile_name || row.wa_id; } },
      { label: 'Entidad', key: 'entity' },
      { label: 'Paso', key: 'sequence' },
      { label: 'Fecha', render: function (row) { return P.dateText(row.due_at); } },
      { label: 'Modo', key: 'delivery_mode' },
      { label: 'Estado', key: 'status' },
      { label: 'Detalle', render: function (row) { return row.skip_reason || row.error_message || row.template_name || ''; } }
    ], data.followups || []);
  }

  async function loadJobs() {
    var data = await P.api('/bot/jobs?limit=100');
    E('botJobsTable').innerHTML = P.rowsTable([
      { label: 'Número', key: 'wa_id' },
      { label: 'Estado', key: 'status' },
      { label: 'Intentos', key: 'attempt_count' },
      { label: 'Disponible', render: function (row) { return P.dateText(row.available_at); } },
      { label: 'Error', key: 'error_message' }
    ], data.jobs || []);
  }

  async function loadBot() {
    var data = await P.api('/bot/status');
    var settings = data.settings;
    E('botEnabled').checked = Boolean(settings.botEnabled);
    E('followupsEnabled').checked = Boolean(settings.followupsEnabled);
    E('businessHourStart').value = settings.businessHourStart;
    E('businessHourEnd').value = settings.businessHourEnd;
    E('botStatusPill').textContent = settings.botEnabled ? 'Activo' : 'Apagado';
    E('botStatusPill').className = 'status-pill ' + (settings.botEnabled ? 'on' : 'off');
    await Promise.all([loadFollowups(), loadJobs()]);
  }

  E('botSettingsForm').addEventListener('submit', function (event) {
    event.preventDefault();
    if (!P.confirmAction('¿Confirmás guardar la activación y los horarios del bot?')) return;
    P.guarded(async function () {
      await P.api('/bot/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          confirm: true,
          botEnabled: P.checked('botEnabled'),
          followupsEnabled: P.checked('followupsEnabled'),
          businessHourStart: Number(V('businessHourStart')),
          businessHourEnd: Number(V('businessHourEnd'))
        })
      });
      P.showToast('Configuración del bot guardada.');
      await loadBot();
    }).catch(function () {});
  });

  E('botPreviewForm').addEventListener('submit', function (event) {
    event.preventDefault();
    P.guarded(async function () {
      var type = V('botPreviewMessageType');
      var data = await P.api('/bot/preview', {
        method: 'POST',
        body: JSON.stringify({
          waId: V('botPreviewWaId'),
          text: V('botPreviewText') || null,
          interactiveId: V('botPreviewInteractiveId') || null,
          messageType: type,
          hasMedia: type === 'document' || type === 'image'
        })
      });
      E('botPreviewResult').textContent = P.pretty(data);
    }).catch(function () {});
  });

  var BLINDAJE_PILL = { SEGURO: 'on', REVISAR: '', RIESGO_ALTO: 'off' };
  var BLINDAJE_TEXTO = { SEGURO: 'Seguro', REVISAR: 'Revisar', RIESGO_ALTO: 'No enviar' };

  function blindajeCard(hallazgo) {
    return '<div class="list-item">'
      + '<strong>' + P.escapeHtml(hallazgo.regla) + ' · ' + P.escapeHtml(hallazgo.gravedad) + '</strong>'
      + '<div class="muted">Detectado: “' + P.escapeHtml(hallazgo.fragmento) + '”</div>'
      + '<div class="muted">' + P.escapeHtml(hallazgo.motivo) + '</div>'
      + '<div>✅ ' + P.escapeHtml(hallazgo.sugerencia) + '</div>'
      + '</div>';
  }

  E('blindajeForm').addEventListener('submit', function (event) {
    event.preventDefault();
    P.guarded(async function () {
      var data = await P.api('/bot/blindaje', {
        method: 'POST',
        body: JSON.stringify({ text: V('blindajeText') })
      });
      var r = data.blindaje;
      E('blindajePill').textContent = BLINDAJE_TEXTO[r.nivel] + ' · ' + r.puntaje + '/100';
      E('blindajePill').className = 'status-pill ' + BLINDAJE_PILL[r.nivel];
      E('blindajeResult').innerHTML = '<div class="notice' + (r.nivel === 'RIESGO_ALTO' ? ' danger' : '') + '">'
        + P.escapeHtml(r.resumen) + '</div>'
        + (r.hallazgos || []).map(blindajeCard).join('');
    }).catch(function () {});
  });

  E('followupStatusFilter').addEventListener('change', function () { P.guarded(loadFollowups).catch(function () {}); });
  E('refreshOverview').addEventListener('click', function () { P.guarded(loadOverview).catch(function () {}); });
  E('refreshBot').addEventListener('click', function () { P.guarded(loadBot).catch(function () {}); });

  P.loadOverview = loadOverview;
  P.loadBot = loadBot;
})();
`;
