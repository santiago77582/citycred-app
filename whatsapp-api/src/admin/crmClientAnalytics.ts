export const CRM_ANALYTICS_JS = String.raw`
(function () {
  'use strict';
  var crm = window.CityCredCrm;
  var loaded = false;
  var loading = false;

  var commercialLabels = {
    NEW: 'Nuevo', PENDING: 'Pendiente', INTERESTED: 'Interesado',
    DOCUMENTATION_PENDING: 'Falta documentación', UNDER_REVIEW: 'En análisis',
    APPROVED: 'Aprobado', REJECTED: 'Rechazado', FINALIZED: 'Finalizado',
    DO_NOT_CONTACT: 'No contactar'
  };
  var messageStatusLabels = {
    RECEIVED: 'Recibidos', PENDING: 'Pendientes', SENT: 'Enviados',
    DELIVERED: 'Entregados', READ: 'Leídos', FAILED: 'Fallidos', UNKNOWN: 'Sin confirmar'
  };

  async function analyticsApi(days) {
    var response = await fetch(
      '/admin/api/analytics/dashboard?days=' + encodeURIComponent(days),
      { credentials: 'same-origin', headers: { accept: 'application/json' } }
    );
    if (response.status === 401) {
      window.location.href = '/admin/login';
      throw new Error('Sesión vencida');
    }
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || 'No se pudieron cargar las estadísticas');
    return data.dashboard;
  }

  function number(value) {
    return Number(value || 0).toLocaleString('es-AR');
  }

  function percentage(value) {
    return value == null ? 'Sin datos' : Number(value).toLocaleString('es-AR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1
    }) + '%';
  }

  function minutes(value) {
    if (value == null) return 'Sin datos';
    var numeric = Number(value);
    if (numeric < 60) return numeric.toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' min';
    var hours = numeric / 60;
    return hours.toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' h';
  }

  function dateLabel(value) {
    var date = new Date(value + 'T00:00:00Z');
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
  }

  function renderKpis(dashboard) {
    var cards = [
      ['Clientes', number(dashboard.contacts.total), 'Base activa del CRM'],
      ['Conversaciones activas', number(dashboard.conversations.activeInPeriod), 'Dentro del período'],
      ['Mensajes recibidos', number(dashboard.messages.inbound), 'Entrantes'],
      ['Mensajes enviados', number(dashboard.messages.outbound), 'Salientes'],
      ['Tasa de entrega', percentage(dashboard.messages.deliveryRatePercent), 'Entregados o leídos'],
      ['Respuesta promedio', minutes(dashboard.responseTime.averageMinutes), number(dashboard.responseTime.measuredResponses) + ' respuestas medidas'],
      ['Fallidos', number(dashboard.messages.failed), 'Mensajes con error'],
      ['Alertas abiertas', number(dashboard.alerts.open), number(dashboard.alerts.criticalOpen) + ' críticas']
    ];
    document.getElementById('analyticsKpis').innerHTML = cards.map(function (card) {
      return '<article class="analytics-kpi"><span>' + crm.text(card[0]) + '</span>' +
        '<strong>' + crm.text(card[1]) + '</strong><small>' + crm.text(card[2]) + '</small></article>';
    }).join('');
  }

  function renderBars(containerId, items, emptyText) {
    var container = document.getElementById(containerId);
    var normalized = items.filter(function (item) { return Number(item.value) > 0; });
    if (!normalized.length) {
      container.innerHTML = '<div class="analytics-empty">' + crm.text(emptyText) + '</div>';
      return;
    }
    var max = Math.max.apply(null, normalized.map(function (item) { return Number(item.value); }));
    container.innerHTML = normalized.map(function (item) {
      var width = max > 0 ? Math.max(4, Math.round((Number(item.value) / max) * 100)) : 0;
      return '<div class="analytics-bar-row"><div class="analytics-bar-label"><span>' +
        crm.text(item.label) + '</span><strong>' + number(item.value) + '</strong></div>' +
        '<div class="analytics-bar-track"><span style="width:' + width + '%"></span></div></div>';
    }).join('');
  }

  function renderDaily(dashboard) {
    var container = document.getElementById('analyticsDailyChart');
    var daily = dashboard.daily || [];
    if (!daily.length) {
      container.innerHTML = '<div class="analytics-empty">No hay actividad para mostrar.</div>';
      return;
    }
    var max = Math.max.apply(null, daily.map(function (row) {
      return Math.max(Number(row.inbound || 0), Number(row.outbound || 0), Number(row.failed || 0));
    }).concat([1]));
    var labelEvery = daily.length <= 14 ? 1 : daily.length <= 31 ? 3 : daily.length <= 100 ? 10 : 30;
    container.innerHTML = '<div class="analytics-chart-legend"><span class="legend-inbound">Recibidos</span>' +
      '<span class="legend-outbound">Enviados</span><span class="legend-failed">Fallidos</span></div>' +
      '<div class="analytics-chart-scroll"><div class="analytics-day-columns">' + daily.map(function (row, index) {
        var inboundHeight = Math.round((Number(row.inbound || 0) / max) * 100);
        var outboundHeight = Math.round((Number(row.outbound || 0) / max) * 100);
        var failedHeight = Math.round((Number(row.failed || 0) / max) * 100);
        var title = dateLabel(row.date) + ' — Recibidos: ' + number(row.inbound) +
          ', Enviados: ' + number(row.outbound) + ', Fallidos: ' + number(row.failed);
        var showLabel = index % labelEvery === 0 || index === daily.length - 1;
        return '<div class="analytics-day" title="' + crm.text(title) + '"><div class="analytics-day-bars">' +
          '<span class="day-inbound" style="height:' + inboundHeight + '%"></span>' +
          '<span class="day-outbound" style="height:' + outboundHeight + '%"></span>' +
          '<span class="day-failed" style="height:' + failedHeight + '%"></span></div>' +
          '<small>' + (showLabel ? crm.text(dateLabel(row.date)) : '') + '</small></div>';
      }).join('') + '</div></div>';
  }

  function renderOperations(dashboard) {
    var groups = [
      {
        title: 'Conversaciones',
        values: [
          ['Total', dashboard.conversations.total],
          ['Asignadas', dashboard.conversations.assigned],
          ['Sin asignar', dashboard.conversations.unassigned],
          ['Bot pausado ahora', dashboard.conversations.botPausedNow]
        ]
      },
      {
        title: 'Mensajes',
        values: [
          ['Pendientes', dashboard.messages.pending],
          ['Sin confirmar', dashboard.messages.unknown],
          ['Entregados o leídos', dashboard.messages.deliveredOrRead],
          ['Total del período', dashboard.messages.totalInPeriod]
        ]
      },
      {
        title: 'Tiempos de respuesta',
        values: [
          ['Promedio', minutes(dashboard.responseTime.averageMinutes)],
          ['Mediana', minutes(dashboard.responseTime.medianMinutes)],
          ['Conversaciones medidas', dashboard.responseTime.measuredConversations],
          ['Respuestas medidas', dashboard.responseTime.measuredResponses]
        ]
      },
      {
        title: 'Campañas y alertas',
        values: [
          ['Borradores', dashboard.campaigns.drafts],
          ['Con vista previa', dashboard.campaigns.previewed],
          ['Alertas abiertas', dashboard.alerts.open],
          ['Alertas críticas', dashboard.alerts.criticalOpen]
        ]
      }
    ];
    document.getElementById('analyticsOperations').innerHTML = groups.map(function (group) {
      return '<article class="analytics-operation-card"><h3>' + crm.text(group.title) + '</h3>' +
        group.values.map(function (value) {
          return '<div><span>' + crm.text(value[0]) + '</span><strong>' +
            crm.text(typeof value[1] === 'number' ? number(value[1]) : value[1]) + '</strong></div>';
        }).join('') + '</article>';
    }).join('');
  }

  function renderLimits(dashboard) {
    var messages = [];
    if (dashboard.limits.messagesTruncated) messages.push('mensajes');
    if (dashboard.limits.contactsTruncated) messages.push('clientes');
    if (dashboard.limits.conversationsTruncated) messages.push('conversaciones');
    var notice = document.getElementById('analyticsLimitNotice');
    if (!messages.length) {
      notice.classList.add('hidden');
      notice.textContent = '';
      return;
    }
    notice.textContent = 'El tablero alcanzó el límite de lectura para: ' + messages.join(', ') + '. Los valores pueden ser parciales.';
    notice.classList.remove('hidden');
  }

  function renderDashboard(dashboard) {
    renderKpis(dashboard);
    renderDaily(dashboard);
    renderBars('analyticsConsent', [
      { label: 'Otorgado', value: dashboard.contacts.consentGranted },
      { label: 'Sin registrar', value: dashboard.contacts.consentUnknown },
      { label: 'Revocado', value: dashboard.contacts.consentRevoked },
      { label: 'No contactar', value: dashboard.contacts.doNotContact }
    ], 'No hay clientes registrados.');
    renderBars('analyticsMessageStatus', Object.keys(dashboard.messages.byStatus || {}).map(function (key) {
      return { label: messageStatusLabels[key] || key, value: dashboard.messages.byStatus[key] };
    }), 'No hay mensajes en el período.');
    renderBars('analyticsEntities', (dashboard.contacts.topEntities || []).map(function (item) {
      return { label: item.entity, value: item.count };
    }), 'No hay entidades registradas.');
    renderBars('analyticsCommercialStatus', Object.keys(dashboard.contacts.byCommercialStatus || {}).map(function (key) {
      return { label: commercialLabels[key] || key, value: dashboard.contacts.byCommercialStatus[key] };
    }), 'No hay estados comerciales registrados.');
    renderOperations(dashboard);
    renderLimits(dashboard);
    document.getElementById('analyticsPeriodLabel').textContent = 'Últimos ' + dashboard.period.days + ' días';
    document.getElementById('analyticsUpdatedAt').textContent = 'Actualizado: ' +
      new Date(dashboard.period.to).toLocaleString('es-AR');
  }

  function setLoading() {
    document.getElementById('analyticsKpis').innerHTML = Array.from({ length: 8 }).map(function () {
      return '<div class="analytics-kpi analytics-loading"></div>';
    }).join('');
    ['analyticsDailyChart', 'analyticsConsent', 'analyticsMessageStatus',
      'analyticsEntities', 'analyticsCommercialStatus', 'analyticsOperations'].forEach(function (id) {
      document.getElementById(id).innerHTML = '<div class="analytics-empty">Cargando…</div>';
    });
  }

  async function loadDashboard() {
    if (loading) return;
    loading = true;
    setLoading();
    var refreshButton = document.getElementById('refreshAnalytics');
    refreshButton.disabled = true;
    try {
      var days = document.getElementById('analyticsDays').value;
      var dashboard = await analyticsApi(days);
      renderDashboard(dashboard);
      loaded = true;
    } catch (error) {
      crm.showToast(error.message, true);
      document.getElementById('analyticsKpis').innerHTML = '<div class="analytics-empty analytics-error">No se pudieron cargar las estadísticas.</div>';
    } finally {
      loading = false;
      refreshButton.disabled = false;
    }
  }

  document.getElementById('analyticsDays').addEventListener('change', loadDashboard);
  document.getElementById('refreshAnalytics').addEventListener('click', loadDashboard);
  crm.registerLoader('analytics', function () {
    if (!loaded) loadDashboard();
  });
})();
`;
