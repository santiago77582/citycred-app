export const TEMPLATE_COMPOSER_JS = String.raw`
(function () {
  'use strict';
  var composer = document.getElementById('composer');
  var messageInput = document.getElementById('messageInput');
  var toast = document.getElementById('toast');
  if (!composer || !messageInput || !toast) return;

  var templates = [];
  var filteredTemplates = [];
  var selectedTemplate = null;
  var selectedFields = [];

  var button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary template-open-button';
  button.textContent = 'Plantilla';
  button.title = 'Enviar una plantilla aprobada por Meta';
  composer.classList.add('template-enabled');
  composer.insertBefore(button, messageInput);

  var overlay = document.createElement('div');
  overlay.className = 'template-modal hidden';
  overlay.innerHTML = '<div class="template-dialog" role="dialog" aria-modal="true" aria-labelledby="templateDialogTitle">' +
    '<div class="template-dialog-head"><div><h2 id="templateDialogTitle">Enviar plantilla</h2>' +
    '<p>Solo aparecen plantillas aprobadas y sincronizadas.</p></div>' +
    '<button id="templateClose" class="media-close" type="button" aria-label="Cerrar">×</button></div>' +
    '<div class="template-dialog-grid"><section class="template-picker">' +
    '<input id="templatePickerSearch" class="template-picker-search" type="search" placeholder="Buscar plantilla">' +
    '<div id="templatePickerList" class="template-picker-list"></div></section>' +
    '<section id="templatePickerDetail" class="template-picker-detail"><div class="empty">Elegí una plantilla.</div></section></div>' +
    '<div class="template-charge-notice">El envío puede generar cargos de Meta según la categoría y el país.</div>' +
    '<div class="media-dialog-actions"><button id="templateCancel" class="secondary" type="button">Cancelar</button>' +
    '<button id="templateSend" class="primary" type="button" disabled>Enviar plantilla</button></div></div>';
  document.body.appendChild(overlay);

  var searchInput = document.getElementById('templatePickerSearch');
  var list = document.getElementById('templatePickerList');
  var detail = document.getElementById('templatePickerDetail');
  var sendButton = document.getElementById('templateSend');
  var cancelButton = document.getElementById('templateCancel');
  var closeButton = document.getElementById('templateClose');

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showToast(message, error) {
    toast.textContent = message;
    toast.classList.toggle('error', Boolean(error));
    toast.classList.remove('hidden');
    window.setTimeout(function () { toast.classList.add('hidden'); }, 3600);
  }

  function selectedWaId() {
    var value = document.getElementById('contactPhone').textContent || '';
    return value.replace(/\D/g, '');
  }

  async function templateApi(path, options) {
    var response = await fetch('/admin/api/templates' + path, Object.assign({
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

  function hasMediaHeader(template) {
    var header = componentByType(template, 'HEADER');
    if (!header) return false;
    var format = String(header.format || 'TEXT').toUpperCase();
    return ['IMAGE', 'VIDEO', 'DOCUMENT'].indexOf(format) >= 0;
  }

  function templateBody(template) {
    var body = componentByType(template, 'BODY');
    return body && body.text ? String(body.text) : '';
  }

  function renderList() {
    if (!filteredTemplates.length) {
      list.innerHTML = '<div class="empty">No hay plantillas aprobadas que coincidan.</div>';
      return;
    }
    list.innerHTML = filteredTemplates.map(function (template) {
      var active = selectedTemplate && selectedTemplate.id === template.id ? ' active' : '';
      var media = hasMediaHeader(template) ? '<span class="template-media-mark">Requiere archivo</span>' : '';
      return '<button class="template-picker-item' + active + '" data-template-id="' + escapeHtml(template.id) + '" type="button">' +
        '<strong>' + escapeHtml(template.name) + '</strong><span>' + escapeHtml(template.languageCode) +
        ' · ' + escapeHtml(template.category || 'Sin categoría') + '</span>' + media + '</button>';
    }).join('');
    list.querySelectorAll('[data-template-id]').forEach(function (item) {
      item.addEventListener('click', function () {
        selectedTemplate = templates.find(function (template) {
          return template.id === item.dataset.templateId;
        }) || null;
        renderList();
        renderDetail();
      });
    });
  }

  function collectFields(template) {
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
          component: 'button',
          subType: 'url',
          index: index,
          number: number,
          label: 'Botón “' + String(button.text || index + 1) + '” — variable ' + number
        });
      });
    });
    return fields;
  }

  function currentValues() {
    var values = {};
    detail.querySelectorAll('[data-template-field]').forEach(function (input) {
      values[input.dataset.templateField] = input.value;
    });
    return values;
  }

  function replaceVariables(text, component, values) {
    return escapeHtml(text).replace(/{{\s*(\d+)\s*}}/g, function (_all, number) {
      var key = component + ':' + number;
      return '<mark>' + escapeHtml(values[key] || '{{' + number + '}}') + '</mark>';
    }).replace(/\n/g, '<br>');
  }

  function updatePreview() {
    if (!selectedTemplate) return;
    var values = currentValues();
    var header = componentByType(selectedTemplate, 'HEADER');
    var body = componentByType(selectedTemplate, 'BODY');
    var previewHeader = document.getElementById('templateLiveHeader');
    var previewBody = document.getElementById('templateLiveBody');
    if (previewHeader && header && header.text) {
      previewHeader.innerHTML = replaceVariables(header.text, 'header', values);
    }
    if (previewBody) {
      previewBody.innerHTML = replaceVariables(body && body.text || '', 'body', values);
    }
    var complete = selectedFields.every(function (field) {
      var key = field.component + ':' + (field.index == null ? '' : field.index + ':') + field.number;
      return String(values[key] || '').trim().length > 0;
    });
    sendButton.disabled = hasMediaHeader(selectedTemplate) || !complete;
  }

  function renderDetail() {
    if (!selectedTemplate) {
      detail.innerHTML = '<div class="empty">Elegí una plantilla.</div>';
      sendButton.disabled = true;
      return;
    }
    selectedFields = collectFields(selectedTemplate);
    var header = componentByType(selectedTemplate, 'HEADER');
    var body = componentByType(selectedTemplate, 'BODY');
    var footer = componentByType(selectedTemplate, 'FOOTER');
    var buttons = componentByType(selectedTemplate, 'BUTTONS');
    var mediaBlocked = hasMediaHeader(selectedTemplate);
    var preview = '<div class="template-live-preview">' +
      (header && header.text ? '<div id="templateLiveHeader" class="template-preview-header">' + escapeHtml(header.text) + '</div>' : '') +
      (mediaBlocked ? '<div class="template-media-header">Encabezado multimedia: ' + escapeHtml(header.format) + '</div>' : '') +
      '<div id="templateLiveBody" class="template-preview-body">' + escapeHtml(body && body.text || '').replace(/\n/g, '<br>') + '</div>' +
      (footer && footer.text ? '<div class="template-preview-footer">' + escapeHtml(footer.text) + '</div>' : '') +
      ((buttons && buttons.buttons) ? '<div class="template-buttons">' + buttons.buttons.map(function (item) {
        return '<span>' + escapeHtml(item.text || item.type) + '</span>';
      }).join('') + '</div>' : '') + '</div>';
    var fields = selectedFields.length ? '<div class="template-variable-fields"><h3>Completar variables</h3>' +
      selectedFields.map(function (field) {
        var key = field.component + ':' + (field.index == null ? '' : field.index + ':') + field.number;
        return '<label>' + escapeHtml(field.label) + '<input data-template-field="' + escapeHtml(key) + '" maxlength="1024" required></label>';
      }).join('') + '</div>' : '<div class="template-no-variables">La plantilla no tiene variables de texto.</div>';
    var blocked = mediaBlocked
      ? '<div class="template-blocked">Esta plantilla necesita un archivo en el encabezado. El envío se habilitará en el próximo bloque.</div>'
      : '';
    detail.innerHTML = '<div class="template-selected-head"><h3>' + escapeHtml(selectedTemplate.name) + '</h3>' +
      '<span>' + escapeHtml(selectedTemplate.languageCode) + '</span></div>' + preview + fields + blocked;
    detail.querySelectorAll('[data-template-field]').forEach(function (input) {
      input.addEventListener('input', updatePreview);
    });
    updatePreview();
  }

  function buildComponents() {
    var values = currentValues();
    var grouped = { header: [], body: [], buttons: {} };
    selectedFields.forEach(function (field) {
      var key = field.component + ':' + (field.index == null ? '' : field.index + ':') + field.number;
      var parameter = { type: 'text', text: String(values[key] || '').trim() };
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
      grouped[type].sort(function (left, right) { return left.number - right.number; });
      components.push({ type: type, parameters: grouped[type].map(function (item) { return item.parameter; }) });
    });
    Object.keys(grouped.buttons).sort(function (left, right) { return Number(left) - Number(right); }).forEach(function (index) {
      var items = grouped.buttons[index];
      items.sort(function (left, right) { return left.number - right.number; });
      components.push({
        type: 'button', sub_type: 'url', index: String(index),
        parameters: items.map(function (item) { return item.parameter; })
      });
    });
    return components;
  }

  function closeModal() {
    overlay.classList.add('hidden');
    selectedTemplate = null;
    selectedFields = [];
    searchInput.value = '';
    detail.innerHTML = '<div class="empty">Elegí una plantilla.</div>';
    sendButton.disabled = true;
    sendButton.textContent = 'Enviar plantilla';
    cancelButton.disabled = false;
    closeButton.disabled = false;
  }

  async function openModal() {
    if (!selectedWaId()) {
      showToast('Primero elegí una conversación.', true);
      return;
    }
    overlay.classList.remove('hidden');
    list.innerHTML = '<div class="empty">Cargando plantillas…</div>';
    try {
      var data = await templateApi('?status=APPROVED&limit=500');
      templates = data.templates || [];
      filteredTemplates = templates.slice();
      renderList();
      searchInput.focus();
    } catch (error) {
      list.innerHTML = '<div class="empty">No se pudieron cargar las plantillas.</div>';
      showToast(error.message, true);
    }
  }

  button.addEventListener('click', openModal);
  searchInput.addEventListener('input', function () {
    var search = searchInput.value.trim().toLowerCase();
    filteredTemplates = templates.filter(function (template) {
      return !search || String(template.name + ' ' + (template.category || '')).toLowerCase().indexOf(search) >= 0;
    });
    renderList();
  });

  sendButton.addEventListener('click', async function () {
    var waId = selectedWaId();
    if (!selectedTemplate || !waId || sendButton.disabled) return;
    sendButton.disabled = true;
    sendButton.textContent = 'Enviando…';
    cancelButton.disabled = true;
    closeButton.disabled = true;
    try {
      var components = buildComponents();
      var data = await templateApi('/' + encodeURIComponent(selectedTemplate.id) + '/send', {
        method: 'POST',
        body: JSON.stringify({ to: waId, components: components.length ? components : undefined })
      });
      var warning = data.warning;
      closeModal();
      showToast(warning || 'Plantilla enviada.', Boolean(warning));
      var activeChat = document.querySelector('.chat-item.active');
      if (activeChat) activeChat.click();
    } catch (error) {
      sendButton.disabled = false;
      sendButton.textContent = 'Enviar plantilla';
      cancelButton.disabled = false;
      closeButton.disabled = false;
      showToast(error.message, true);
    }
  });

  cancelButton.addEventListener('click', closeModal);
  closeButton.addEventListener('click', closeModal);
  overlay.addEventListener('click', function (event) {
    if (event.target === overlay && !cancelButton.disabled) closeModal();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !overlay.classList.contains('hidden') && !cancelButton.disabled) {
      closeModal();
    }
  });
})();
`;
