export const CRM_CAMPAIGNS_JS = String.raw`
(function () {
  'use strict';
  var crm = window.CityCredCrm;
  var campaigns = [];
  var templates = [];
  var labels = [];
  var selectedCampaign = null;
  var loaded = false;
  var executionEnabled = false;
  var executionConfig = {};

  var statusOptions = [
    ['NEW', 'Nuevo'], ['PENDING', 'Pendiente'], ['INTERESTED', 'Interesado'],
    ['DOCUMENTATION_PENDING', 'Falta documentación'], ['UNDER_REVIEW', 'En análisis'],
    ['APPROVED', 'Aprobado'], ['REJECTED', 'Rechazado'], ['FINALIZED', 'Finalizado']
  ];
  var campaignStatusLabels = {
    DRAFT: 'Borrador', PREVIEWED: 'Vista previa generada', APPROVED: 'Aprobada',
    RUNNING: 'En ejecución', COMPLETED: 'Completada',
    COMPLETED_WITH_ERRORS: 'Completada con alertas', CANCELLED: 'Cancelada'
  };
  var exclusionLabels = {
    DO_NOT_CONTACT: 'Baja o no contactar',
    CONSENT_NOT_GRANTED: 'Sin consentimiento otorgado',
    INVALID_PHONE: 'Teléfono inválido'
  };

  async function api(path, options) {
    var response = await fetch('/admin/api/campaigns' + path, Object.assign({
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }
    }, options || {}));
    if (response.status === 401) {
      window.location.href = '/admin/login';
      throw new Error('Sesión vencida');
    }
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación');
    return data;
  }

  async function auxiliaryApi(path) {
    var response = await fetch(path, {
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }
    });
    if (response.status === 401) {
      window.location.href = '/admin/login';
      throw new Error('Sesión vencida');
    }
    var data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los datos auxiliares');
    return data;
  }

  function mediaHeader(template) {
    return (template.components || []).some(function (component) {
      return String(component.type || '').toUpperCase() === 'HEADER' &&
        ['IMAGE', 'VIDEO', 'DOCUMENT'].indexOf(String(component.format || '').toUpperCase()) >= 0;
    });
  }

  function componentByType(template, type) {
    return (template.components || []).find(function (component) {
      return String(component.type || '').toUpperCase() === type;
    });
  }

  function variableNumbers(text) {
    var values = [];
    var seen = {};
    var regex = /{{\s*(\d+)\s*}}/g;
    var match;
    while ((match = regex.exec(String(text || ''))) !== null) {
      var number = Number(match[1]);
      if (!seen[number]) {
        seen[number] = true;
        values.push(number);
      }
    }
    return values.sort(function (left, right) { return left - right; });
  }

  function collectVariableFields(template) {
    if (!template) return [];
    var fields = [];
    var header = componentByType(template, 'HEADER');
    if (header && String(header.format || 'TEXT').toUpperCase() === 'TEXT') {
      variableNumbers(header.text).forEach(function (number) {
        fields.push({ component: 'header', number: number, label: 'Encabezado — variable ' + number });
      });
    }
    var body = componentByType(template, 'BODY');
    variableNumbers(body && body.text).forEach(function (number) {
      fields.push({ component: 'body', number: number, label: 'Mensaje — variable ' + number });
    });
    var buttons = componentByType(template, 'BUTTONS');
    (buttons && Array.isArray(buttons.buttons) ? buttons.buttons : []).forEach(function (button, index) {
      if (String(button.type || '').toUpperCase() !== 'URL') return;
      variableNumbers(button.url).forEach(function (number) {
        fields.push({
          component: 'button', index: index, number: number,
          label: 'Botón “' + String(button.text || index + 1) + '” — variable ' + number
        });
      });
    });
    return fields;
  }

  function componentKey(field) {
    return field.component + ':' + (field.index == null ? '' : field.index + ':') + field.number;
  }

  function valuesFromComponents(components) {
    var values = {};
    (components || []).forEach(function (component) {
      var type = String(component.type || '').toLowerCase();
      var index = component.index == null ? null : Number(component.index);
      (component.parameters || []).forEach(function (parameter, parameterIndex) {
        var key = type + ':' + (index == null ? '' : index + ':') + (parameterIndex + 1);
        if (parameter && parameter.type === 'text') values[key] = parameter.text || '';
      });
    });
    return values;
  }

  function buildComponents() {
    var fields = collectVariableFields(currentTemplate());
    var grouped = { header: [], body: [], buttons: {} };
    fields.forEach(function (field) {
      var input = document.querySelector('[data-campaign-variable="' + CSS.escape(componentKey(field)) + '"]');
      var text = input ? input.value.trim() : '';
      if (!text) return;
      var parameter = { type: 'text', text: text };
      if (field.component === 'button') {
        if (!grouped.buttons[field.index]) grouped.buttons[field.index] = [];
        grouped.buttons[field.index].push({ number: field.number, parameter: parameter });
      } else {
        grouped[field.component].push({ number: field.number, parameter: parameter });
      }
    });
    var components = [];
    ['header', 'body'].forEach(function (type) {
      if (!grouped[type].length) return;
      grouped[type].sort(function (a, b) { return a.number - b.number; });
      components.push({ type: type, parameters: grouped[type].map(function (item) { return item.parameter; }) });
    });
    Object.keys(grouped.buttons).sort(function (a, b) { return Number(a) - Number(b); }).forEach(function (index) {
      var items = grouped.buttons[index];
      items.sort(function (a, b) { return a.number - b.number; });
      components.push({
        type: 'button', sub_type: 'url', index: String(index),
        parameters: items.map(function (item) { return item.parameter; })
      });
    });
    return components;
  }

  function currentTemplate() {
    var id = document.getElementById('campaignTemplate').value;
    return templates.find(function (template) { return template.id === id; }) || null;
  }

  function renderStatusCheckboxes(selected) {
    var selectedSet = new Set(selected || []);
    document.getElementById('campaignStatuses').innerHTML = statusOptions.map(function (item) {
      return '<label class="campaign-check"><input type="checkbox" value="' + crm.text(item[0]) + '"' +
        (selectedSet.has(item[0]) ? ' checked' : '') + '><span>' + crm.text(item[1]) + '</span></label>';
    }).join('');
  }

  function renderLabelCheckboxes(selected) {
    var selectedSet = new Set(selected || []);
    var container = document.getElementById('campaignLabels');
    container.innerHTML = labels.length ? labels.map(function (label) {
      return '<label class="campaign-check"><input type="checkbox" value="' + crm.text(label.id) + '"' +
        (selectedSet.has(label.id) ? ' checked' : '') + '><span class="label-dot" style="background:' +
        crm.text(label.color || '#5b36c9') + '"></span><span>' + crm.text(label.name) + '</span></label>';
    }).join('') : '<span class="muted">No hay etiquetas creadas.</span>';
  }

  function renderTemplateOptions(selectedId) {
    var allowed = templates.filter(function (template) { return !mediaHeader(template); });
    var select = document.getElementById('campaignTemplate');
    select.innerHTML = '<option value="">Elegir plantilla</option>' + allowed.map(function (template) {
      return '<option value="' + crm.text(template.id) + '"' +
        (template.id === selectedId ? ' selected' : '') + '>' +
        crm.text(template.name + ' · ' + template.languageCode + ' · ' + (template.category || 'Sin categoría')) +
        '</option>';
    }).join('');
  }

  function renderVariableFields(existingComponents) {
    var template = currentTemplate();
    var fields = collectVariableFields(template);
    var section = document.getElementById('campaignVariables');
    var container = document.getElementById('campaignVariableFields');
    if (!fields.length) {
      section.classList.add('hidden');
      container.innerHTML = '';
      return;
    }
    var values = valuesFromComponents(existingComponents || []);
    section.classList.remove('hidden');
    container.innerHTML = fields.map(function (field) {
      var key = componentKey(field);
      return '<label>' + crm.text(field.label) + '<input data-campaign-variable="' + crm.text(key) +
        '" maxlength="1024" value="' + crm.text(values[key] || '') + '" required></label>';
    }).join('');
  }

  function parseCommaValues(value) {
    return Array.from(new Set(String(value || '').split(',').map(function (item) {
      return item.trim();
    }).filter(Boolean)));
  }

  function checkedValues(containerId) {
    return Array.from(document.querySelectorAll('#' + containerId + ' input:checked')).map(function (input) {
      return input.value;
    });
  }

  function openForm(campaign) {
    selectedCampaign = campaign || null;
    document.getElementById('campaignDetail').classList.add('hidden');
    document.getElementById('campaignForm').classList.remove('hidden');
    document.getElementById('campaignId').value = campaign ? campaign.id : '';
    document.getElementById('campaignFormTitle').textContent = campaign ? 'Editar borrador' : 'Nuevo borrador';
    document.getElementById('campaignName').value = campaign ? campaign.name : '';
    document.getElementById('campaignSearch').value = campaign && campaign.audienceFilter.search || '';
    document.getElementById('campaignEntities').value = campaign && campaign.audienceFilter.entities
      ? campaign.audienceFilter.entities.join(', ')
      : '';
    renderTemplateOptions(campaign ? campaign.templateId : '');
    renderStatusCheckboxes(campaign && campaign.audienceFilter.commercialStatuses || []);
    renderLabelCheckboxes(campaign && campaign.audienceFilter.labelIds || []);
    renderVariableFields(campaign && campaign.templateComponents || []);
    document.getElementById('campaignName').focus();
  }

  function closeForm() {
    document.getElementById('campaignForm').classList.add('hidden');
    document.getElementById('campaignDetail').classList.remove('hidden');
    if (selectedCampaign) renderDetail(selectedCampaign);
    else document.getElementById('campaignDetail').innerHTML = '<div class="empty">Elegí una campaña o creá un nuevo borrador.</div>';
  }

  function renderCampaignList() {
    var list = document.getElementById('campaignList');
    if (!campaigns.length) {
      list.innerHTML = '<div class="empty">Todavía no hay campañas.</div>';
      return;
    }
    list.innerHTML = campaigns.map(function (campaign) {
      var active = selectedCampaign && selectedCampaign.id === campaign.id ? ' active' : '';
      var summary = campaign.previewSummary || {};
      var audience = ['PREVIEWED', 'APPROVED', 'RUNNING', 'COMPLETED', 'COMPLETED_WITH_ERRORS'].indexOf(campaign.status) >= 0
        ? '<span>' + String(summary.eligibleCount || 0) + ' habilitados</span>'
        : '<span>Sin vista previa</span>';
      return '<button class="campaign-item' + active + '" data-campaign-id="' + crm.text(campaign.id) + '" type="button">' +
        '<strong>' + crm.text(campaign.name) + '</strong><span>' + crm.text(campaign.template.name) + '</span>' +
        '<div><em>' + crm.text(campaignStatusLabels[campaign.status] || campaign.status) + '</em>' + audience + '</div></button>';
    }).join('');
    list.querySelectorAll('[data-campaign-id]').forEach(function (button) {
      button.addEventListener('click', function () {
        var campaign = campaigns.find(function (item) { return item.id === button.dataset.campaignId; });
        if (campaign) selectCampaign(campaign.id);
      });
    });
  }

  function filterDescription(filter) {
    var parts = [];
    if (filter.search) parts.push('Búsqueda: ' + filter.search);
    if (filter.entities && filter.entities.length) parts.push('Entidades: ' + filter.entities.join(', '));
    if (filter.commercialStatuses && filter.commercialStatuses.length) {
      parts.push('Estados: ' + filter.commercialStatuses.join(', '));
    }
    if (filter.labelIds && filter.labelIds.length) {
      var names = filter.labelIds.map(function (id) {
        var label = labels.find(function (item) { return item.id === id; });
        return label ? label.name : id;
      });
      parts.push('Etiquetas: ' + names.join(', '));
    }
    return parts.length ? parts.join(' · ') : 'Todos los clientes, sujetos a las exclusiones obligatorias.';
  }

  function renderRecipientRows(recipients) {
    if (!recipients.length) return '<div class="empty">No hay registros en esta categoría.</div>';
    return '<div class="campaign-recipient-table">' + recipients.map(function (recipient) {
      return '<div class="campaign-recipient-row"><div><strong>' + crm.text(recipient.profile_name || recipient.phone) +
        '</strong><span>' + crm.text(recipient.entity || 'Sin entidad') + ' · ' + crm.text(recipient.phone) + '</span></div>' +
        '<em>' + crm.text(recipient.skip_reason ? (exclusionLabels[recipient.skip_reason] || recipient.skip_reason) : 'Habilitado') + '</em></div>';
    }).join('') + '</div>';
  }

  async function loadRecipients(campaignId, status) {
    var target = document.getElementById(status === 'READY' ? 'campaignReadyRecipients' : 'campaignSkippedRecipients');
    target.innerHTML = '<div class="empty">Cargando…</div>';
    try {
      var data = await api('/' + encodeURIComponent(campaignId) + '/recipients?status=' + status + '&limit=200');
      target.innerHTML = renderRecipientRows(data.recipients || []);
    } catch (error) {
      target.innerHTML = '<div class="empty">No se pudieron cargar los destinatarios.</div>';
      crm.showToast(error.message, true);
    }
  }

  function renderDetail(campaign) {
    selectedCampaign = campaign;
    document.getElementById('campaignForm').classList.add('hidden');
    var detail = document.getElementById('campaignDetail');
    detail.classList.remove('hidden');
    var summary = campaign.previewSummary || {};
    var isEditable = campaign.status === 'DRAFT' || campaign.status === 'PREVIEWED';
    var hasPreview = ['PREVIEWED', 'APPROVED', 'RUNNING', 'COMPLETED', 'COMPLETED_WITH_ERRORS'].indexOf(campaign.status) >= 0;
    var preview = hasPreview
      ? '<div class="campaign-metrics"><div><strong>' + String(summary.candidateCount || 0) + '</strong><span>Candidatos</span></div>' +
        '<div><strong>' + String(summary.eligibleCount || 0) + '</strong><span>Habilitados</span></div>' +
        '<div><strong>' + String(summary.excludedCount || 0) + '</strong><span>Excluidos</span></div></div>' +
        '<div class="campaign-exclusions">' + Object.keys(summary.exclusionReasons || {}).map(function (reason) {
          return '<span>' + crm.text(exclusionLabels[reason] || reason) + ': <strong>' + summary.exclusionReasons[reason] + '</strong></span>';
        }).join('') + '</div>' +
        '<div class="campaign-recipient-sections"><section><h3>Habilitados</h3><div id="campaignReadyRecipients"></div></section>' +
        '<section><h3>Excluidos</h3><div id="campaignSkippedRecipients"></div></section></div>'
      : '<div class="campaign-empty-preview">Todavía no se generó una vista previa.</div>';
    var actions = '';
    if (isEditable) {
      actions += '<button id="editCampaign" class="secondary" type="button">Editar borrador</button>' +
        '<button id="previewCampaign" class="primary" type="button">Generar vista previa</button>';
    }
    if (campaign.status === 'PREVIEWED' || campaign.status === 'APPROVED') {
      actions += '<button id="simulateCampaign" class="secondary" type="button">Simular ejecución</button>';
    }
    if (campaign.status === 'PREVIEWED') {
      actions += '<button id="approveCampaign" class="primary" type="button">Aprobar</button>';
    }
    if (campaign.status === 'APPROVED' && executionEnabled) {
      actions += '<button id="executeCampaign" class="danger-button" type="button">Iniciar envíos</button>';
    }
    if (['DRAFT', 'PREVIEWED', 'APPROVED'].indexOf(campaign.status) >= 0) {
      actions += '<button id="cancelCampaign" class="danger-button" type="button">Cancelar</button>';
    }
    var executionNotice = executionEnabled
      ? 'La ejecución exige aprobador y ejecutor distintos, revalida cada baja y respeta el horario configurado.'
      : 'La ejecución está bloqueada por configuración. Se puede simular y aprobar, pero no enviar.';
    detail.innerHTML = '<div class="campaign-detail-head"><div><h2>' + crm.text(campaign.name) + '</h2>' +
      '<p>' + crm.text(campaign.template.name + ' · ' + campaign.template.languageCode + ' · ' + (campaign.template.category || 'Sin categoría')) + '</p></div>' +
      '<span class="campaign-status campaign-status-' + crm.text(campaign.status.toLowerCase()) + '">' +
      crm.text(campaignStatusLabels[campaign.status] || campaign.status) + '</span></div>' +
      '<div class="campaign-lock-inline">' + crm.text(executionNotice) + '</div>' +
      '<div class="campaign-filter-description"><strong>Segmentación:</strong> ' + crm.text(filterDescription(campaign.audienceFilter || {})) + '</div>' +
      '<div class="campaign-detail-actions">' + actions + '</div>' + preview;
    if (isEditable) {
      document.getElementById('editCampaign').addEventListener('click', function () { openForm(campaign); });
      document.getElementById('previewCampaign').addEventListener('click', function () { generatePreview(campaign.id); });
    }
    if (document.getElementById('simulateCampaign')) {
      document.getElementById('simulateCampaign').addEventListener('click', function () { simulateCampaign(campaign.id); });
    }
    if (document.getElementById('approveCampaign')) {
      document.getElementById('approveCampaign').addEventListener('click', function () { approveCampaign(campaign.id); });
    }
    if (document.getElementById('executeCampaign')) {
      document.getElementById('executeCampaign').addEventListener('click', function () { executeCampaign(campaign.id); });
    }
    if (document.getElementById('cancelCampaign')) {
      document.getElementById('cancelCampaign').addEventListener('click', function () { cancelCampaign(campaign.id); });
    }
    if (hasPreview) {
      loadRecipients(campaign.id, 'READY');
      loadRecipients(campaign.id, 'SKIPPED');
    }
    renderCampaignList();
  }

  async function selectCampaign(id) {
    try {
      var data = await api('/' + encodeURIComponent(id));
      renderDetail(data.campaign);
    } catch (error) { crm.showToast(error.message, true); }
  }

  async function generatePreview(id) {
    var button = document.getElementById('previewCampaign');
    button.disabled = true;
    button.textContent = 'Calculando…';
    try {
      await api('/' + encodeURIComponent(id) + '/preview', { method: 'POST', body: '{}' });
      crm.showToast('Vista previa generada. No se envió ningún mensaje.');
      await loadCampaigns();
      await selectCampaign(id);
    } catch (error) {
      crm.showToast(error.message, true);
      button.disabled = false;
      button.textContent = 'Generar vista previa';
    }
  }

  async function simulateCampaign(id) {
    try {
      var data = await api('/' + encodeURIComponent(id) + '/simulate', { method: 'POST', body: '{}' });
      var simulation = data.simulation || {};
      var message = 'Simulación: ' + String(simulation.eligibleCount || 0) + ' habilitados';
      if (simulation.newlyExcludedCount) message += ', ' + String(simulation.newlyExcludedCount) + ' excluidos nuevos';
      message += '. No se envió ningún mensaje.';
      crm.showToast(message, Boolean(simulation.newlyExcludedCount));
    } catch (error) { crm.showToast(error.message, true); }
  }

  async function approveCampaign(id) {
    if (!window.confirm('Aprobar esta audiencia. El aprobador debe ser distinto del creador.')) return;
    try {
      await api('/' + encodeURIComponent(id) + '/approve', { method: 'POST', body: '{}' });
      crm.showToast('Campaña aprobada. Todavía no se envió ningún mensaje.');
      await loadCampaigns();
      await selectCampaign(id);
    } catch (error) { crm.showToast(error.message, true); }
  }

  async function executeCampaign(id) {
    var confirmation = window.prompt('Esta acción inicia envíos reales. El ejecutor debe ser distinto del aprobador. Escribí ENVIAR para continuar.');
    if (confirmation !== 'ENVIAR') return;
    try {
      await api('/' + encodeURIComponent(id) + '/execute', {
        method: 'POST', body: JSON.stringify({ confirmation: 'ENVIAR' })
      });
      crm.showToast('Campaña iniciada. La cola revalida cada destinatario antes de enviar.');
      await loadCampaigns();
      await selectCampaign(id);
    } catch (error) { crm.showToast(error.message, true); }
  }

  async function cancelCampaign(id) {
    if (!window.confirm('¿Cancelar este borrador? No se enviará ningún mensaje.')) return;
    try {
      await api('/' + encodeURIComponent(id) + '/cancel', { method: 'POST', body: '{}' });
      crm.showToast('Borrador cancelado.');
      selectedCampaign = null;
      await loadCampaigns();
      document.getElementById('campaignDetail').innerHTML = '<div class="empty">Elegí una campaña o creá un nuevo borrador.</div>';
    } catch (error) { crm.showToast(error.message, true); }
  }

  async function loadCampaigns() {
    try {
      var data = await api('?limit=200');
      campaigns = data.campaigns || [];
      executionEnabled = Boolean(data.executionEnabled);
      executionConfig = data.execution || {};
      var notice = document.getElementById('campaignLockNotice');
      if (notice) {
        notice.innerHTML = executionEnabled
          ? '<strong>Ejecución controlada disponible.</strong> Requiere dos usuarios administradores y horario habilitado.'
          : '<strong>Envío desactivado.</strong> Se pueden preparar, simular y aprobar campañas, pero no ejecutarlas.';
      }
      renderCampaignList();
      loaded = true;
    } catch (error) {
      document.getElementById('campaignList').innerHTML = '<div class="empty">No se pudieron cargar las campañas.</div>';
      crm.showToast(error.message, true);
    }
  }

  async function loadAuxiliaryData() {
    var results = await Promise.all([
      auxiliaryApi('/admin/api/templates?status=APPROVED&limit=500'),
      auxiliaryApi('/admin/api/crm/labels')
    ]);
    templates = (results[0].templates || []).filter(function (template) { return !mediaHeader(template); });
    labels = results[1].labels || [];
  }

  document.getElementById('campaignTemplate').addEventListener('change', function () {
    renderVariableFields([]);
  });
  document.getElementById('newCampaign').addEventListener('click', function () { openForm(null); });
  document.getElementById('closeCampaignForm').addEventListener('click', closeForm);

  document.getElementById('campaignForm').addEventListener('submit', async function (event) {
    event.preventDefault();
    var templateId = document.getElementById('campaignTemplate').value;
    if (!templateId) {
      crm.showToast('Elegí una plantilla aprobada.', true);
      return;
    }
    var payload = {
      name: document.getElementById('campaignName').value.trim(),
      templateId: templateId,
      audienceFilter: {
        search: document.getElementById('campaignSearch').value.trim() || undefined,
        entities: parseCommaValues(document.getElementById('campaignEntities').value),
        commercialStatuses: checkedValues('campaignStatuses'),
        labelIds: checkedValues('campaignLabels')
      },
      templateComponents: buildComponents()
    };
    if (!payload.audienceFilter.entities.length) delete payload.audienceFilter.entities;
    if (!payload.audienceFilter.commercialStatuses.length) delete payload.audienceFilter.commercialStatuses;
    if (!payload.audienceFilter.labelIds.length) delete payload.audienceFilter.labelIds;

    var id = document.getElementById('campaignId').value;
    var saveButton = document.getElementById('saveCampaign');
    saveButton.disabled = true;
    saveButton.textContent = 'Guardando…';
    try {
      var data = await api(id ? '/' + encodeURIComponent(id) : '', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });
      crm.showToast('Borrador guardado. No se envió ningún mensaje.');
      await loadCampaigns();
      closeForm();
      await selectCampaign(data.campaign.id);
    } catch (error) {
      crm.showToast(error.message, true);
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = 'Guardar borrador';
    }
  });

  crm.registerLoader('campaigns', async function () {
    try {
      if (!templates.length && !labels.length) await loadAuxiliaryData();
      renderTemplateOptions('');
      renderStatusCheckboxes([]);
      renderLabelCheckboxes([]);
      if (!loaded) await loadCampaigns();
    } catch (error) { crm.showToast(error.message, true); }
  });
})();
`;
