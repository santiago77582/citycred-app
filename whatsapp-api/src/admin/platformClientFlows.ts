export const PLATFORM_FLOWS_JS = String.raw`
(function () {
  'use strict';
  var P = window.CityCredPlatform;
  var E = P.element;
  var V = P.value;

  async function loadFlows() {
    var data = await P.api('/flows');
    var list = E('flowList');
    list.replaceChildren();
    (data.flows || []).forEach(function (flow) {
      var item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = '<strong>' + P.escapeHtml(flow.name || flow.id) + '</strong><div class="muted">' + P.escapeHtml(flow.status || 'Sin estado') + ' · ' + P.escapeHtml((flow.categories || []).join(', ')) + '</div>';
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'secondary';
      button.textContent = 'Administrar';
      button.addEventListener('click', function () {
        P.guarded(function () { return selectFlow(flow.id); }).catch(function () {});
      });
      item.appendChild(button);
      list.appendChild(item);
    });
    if (!(data.flows || []).length) list.innerHTML = '<div class="muted">No hay Flows o faltan permisos de Meta.</div>';
  }

  async function selectFlow(id) {
    var data = await P.api('/flows/' + encodeURIComponent(id));
    P.selectedFlow = data.flow || {};
    E('selectedFlowId').value = id;
    E('selectedFlowTitle').textContent = P.selectedFlow.name || id;
    E('selectedFlowStatus').textContent = P.selectedFlow.status || 'Sin estado';
    E('flowDetailsTab').textContent = P.pretty(P.selectedFlow);
    E('flowJson').value = P.pretty(P.selectedFlow.flow_json || {
      version: '7.1',
      screens: [{
        id: 'INICIO',
        title: 'Inicio',
        terminal: true,
        layout: { type: 'SingleColumnLayout', children: [] }
      }]
    });
    E('flowWorkspace').classList.remove('hidden');
    E('flowWorkspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  E('flowCreateForm').addEventListener('submit', function (event) {
    event.preventDefault();
    if (!P.confirmAction('¿Confirmás crear este Flow como borrador en Meta?')) return;
    P.guarded(async function () {
      var data = await P.api('/flows', {
        method: 'POST',
        body: JSON.stringify({
          name: V('flowName'),
          categories: [V('flowCategory')],
          cloneFlowId: V('flowCloneId') || null,
          endpointUri: V('flowEndpoint') || null
        })
      });
      P.showToast('Flow creado.');
      await loadFlows();
      if (data.flow && data.flow.id) await selectFlow(data.flow.id);
    }).catch(function () {});
  });

  document.querySelectorAll('[data-flow-tab]').forEach(function (button) {
    button.addEventListener('click', function () {
      document.querySelectorAll('[data-flow-tab]').forEach(function (item) { item.classList.remove('active'); });
      button.classList.add('active');
      ['flowJsonTab', 'flowSendTab', 'flowDetailsTab'].forEach(function (id) { E(id).classList.add('hidden'); });
      var target = button.dataset.flowTab === 'json'
        ? 'flowJsonTab'
        : button.dataset.flowTab === 'send'
          ? 'flowSendTab'
          : 'flowDetailsTab';
      E(target).classList.remove('hidden');
    });
  });

  E('closeFlowWorkspace').addEventListener('click', function () { E('flowWorkspace').classList.add('hidden'); });

  E('saveFlowJson').addEventListener('click', function () {
    var id = V('selectedFlowId');
    if (!id) return;
    P.guarded(async function () {
      var parsed;
      try { parsed = JSON.parse(V('flowJson')); }
      catch (_) { throw new Error('El JSON del Flow no es válido.'); }
      var data = await P.api('/flows/' + encodeURIComponent(id) + '/json', {
        method: 'PUT',
        body: JSON.stringify({ flowJson: parsed })
      });
      E('flowDetailsTab').textContent = P.pretty(data);
      P.showToast('JSON enviado para validación.');
      await selectFlow(id);
    }).catch(function () {});
  });

  async function irreversible(action, message, method) {
    var id = V('selectedFlowId');
    if (!id || !P.confirmAction(message)) return;
    await P.guarded(async function () {
      await P.api('/flows/' + encodeURIComponent(id) + (action ? '/' + action : ''), {
        method: method || 'POST',
        body: JSON.stringify({ confirm: true })
      });
      P.showToast('Operación de Flow completada.');
      E('flowWorkspace').classList.add('hidden');
      await loadFlows();
    }).catch(function () {});
  }

  E('publishFlow').addEventListener('click', function () {
    irreversible('publish', '¿Confirmás publicar este Flow? Después no podrá editarse como borrador.');
  });
  E('deprecateFlow').addEventListener('click', function () {
    irreversible('deprecate', '¿Confirmás retirar este Flow publicado?');
  });
  E('deleteFlow').addEventListener('click', function () {
    irreversible('', '¿Confirmás borrar este borrador de Flow?', 'DELETE');
  });

  E('flowSendTab').addEventListener('submit', function (event) {
    event.preventDefault();
    var id = V('selectedFlowId');
    var to = V('flowSendTo');
    if (!P.confirmAction('¿Confirmás enviar este Flow al número ' + to + '?')) return;
    P.guarded(async function () {
      var initialData;
      try { initialData = JSON.parse(V('flowSendData') || '{}'); }
      catch (_) { throw new Error('Los datos iniciales no son JSON válido.'); }
      await P.api('/flows/send/message', {
        method: 'POST',
        body: JSON.stringify({
          to: to,
          flowId: id,
          flowToken: V('flowSendToken') || undefined,
          cta: V('flowSendCta'),
          body: V('flowSendBody'),
          screen: V('flowSendScreen') || undefined,
          data: initialData,
          mode: 'published'
        })
      });
      P.showToast('Flow enviado.');
    }).catch(function () {});
  });

  function localValue(date) {
    var offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  function setupDates() {
    var end = new Date();
    var start = new Date(end.getTime() - 30 * 86400000);
    E('metaStart').value = localValue(start);
    E('metaEnd').value = localValue(end);
  }

  async function loadMetaAnalytics() {
    var start = new Date(V('metaStart'));
    var end = new Date(V('metaEnd'));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error('Completá las fechas.');
    }
    var messageQuery = new URLSearchParams({
      start: start.toISOString(),
      end: end.toISOString()
    });
    var conversationQuery = new URLSearchParams(messageQuery);
    conversationQuery.set('directions', 'business_initiated,user_initiated');
    conversationQuery.set('dimensions', V('metaDimensions'));
    var results = await Promise.all([
      P.api('/meta-analytics/waba'),
      P.api('/meta-analytics/messages?' + messageQuery.toString()),
      P.api('/meta-analytics/conversations?' + conversationQuery.toString())
    ]);
    E('wabaAnalytics').textContent = P.pretty(results[0].waba);
    E('messageAnalytics').textContent = P.pretty(results[1].analytics);
    E('conversationAnalytics').textContent = P.pretty(results[2].analytics);
  }

  E('refreshFlows').addEventListener('click', function () { P.guarded(loadFlows).catch(function () {}); });
  E('refreshMetaAnalytics').addEventListener('click', function () { P.guarded(loadMetaAnalytics).catch(function () {}); });
  E('metaAnalyticsForm').addEventListener('submit', function (event) {
    event.preventDefault();
    P.guarded(loadMetaAnalytics).catch(function () {});
  });

  setupDates();
  P.loadFlows = loadFlows;
  P.loadMetaAnalytics = loadMetaAnalytics;
})();
`;
