export const CRM_TEMPLATES_JS = String.raw`
(function () {
  'use strict';
  var crm = window.CityCredCrm;
  var templates = [];
  var loaded = false;
  var searchTimer = null;
  var statusLabels = {
    APPROVED: 'Aprobada', PENDING: 'Pendiente', REJECTED: 'Rechazada',
    PAUSED: 'Pausada', DISABLED: 'Desactivada', NOT_FOUND: 'No aparece en Meta',
    LOCAL_DRAFT: 'Borrador local'
  };

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

  function renderButtons(component) {
    var buttons = component && Array.isArray(component.buttons) ? component.buttons : [];
    if (!buttons.length) return '';
    return '<div class="template-buttons">' + buttons.map(function (button) {
      return '<span>' + crm.text(button.text || button.type || 'Botón') + '</span>';
    }).join('') + '</div>';
  }

  function renderPreview(template) {
    var header = componentByType(template, 'HEADER');
    var body = componentByType(template, 'BODY');
    var footer = componentByType(template, 'FOOTER');
    var buttons = componentByType(template, 'BUTTONS');
    var headerText = header && header.text
      ? '<div class="template-preview-header">' + crm.text(header.text) + '</div>'
      : header && header.format && String(header.format).toUpperCase() !== 'TEXT'
        ? '<div class="template-media-header">Encabezado ' + crm.text(String(header.format).toLowerCase()) + '</div>'
        : '';
    var bodyText = body && body.text
      ? '<div class="template-preview-body">' + crm.text(body.text).replace(/\n/g, '<br>') + '</div>'
      : '<div class="template-preview-body muted">Sin texto de cuerpo.</div>';
    var footerText = footer && footer.text
      ? '<div class="template-preview-footer">' + crm.text(footer.text) + '</div>'
      : '';
    return '<div class="template-preview">' + headerText + bodyText + footerText + renderButtons(buttons) + '</div>';
  }

  function renderSummary() {
    var counts = {};
    templates.forEach(function (template) {
      counts[template.status] = (counts[template.status] || 0) + 1;
    });
    var keys = ['APPROVED', 'PENDING', 'REJECTED', 'PAUSED', 'DISABLED', 'NOT_FOUND'];
    document.getElementById('templateSummary').innerHTML = keys.filter(function (key) {
      return counts[key];
    }).map(function (key) {
      return '<span class="template-summary-item status-' + key.toLowerCase() + '">' +
        crm.text(statusLabels[key] || key) + ': <strong>' + counts[key] + '</strong></span>';
    }).join('');
  }

  function renderTemplates() {
    var list = document.getElementById('templateList');
    renderSummary();
    if (!templates.length) {
      list.innerHTML = '<div class="empty">No hay plantillas guardadas. Presioná “Sincronizar con Meta”.</div>';
      return;
    }
    list.innerHTML = templates.map(function (template) {
      var synced = template.lastSyncedAt
        ? new Date(template.lastSyncedAt).toLocaleString('es-AR')
        : 'Nunca';
      var rejection = template.rejectionReason
        ? '<div class="template-rejection"><strong>Motivo:</strong> ' + crm.text(template.rejectionReason) + '</div>'
        : '';
      return '<article class="template-card">' +
        '<div class="template-card-head"><div><h3>' + crm.text(template.name) + '</h3>' +
        '<div class="template-meta">' + crm.text(template.languageCode) + ' · ' +
        crm.text(template.category || 'Sin categoría') + '</div></div>' +
        '<span class="template-status status-' + crm.text(String(template.status).toLowerCase()) + '">' +
        crm.text(statusLabels[template.status] || template.status) + '</span></div>' +
        renderPreview(template) + rejection +
        '<div class="template-sync-time">Última sincronización: ' + crm.text(synced) + '</div>' +
        '</article>';
    }).join('');
  }

  async function loadTemplates() {
    var list = document.getElementById('templateList');
    list.innerHTML = '<div class="empty">Cargando plantillas…</div>';
    try {
      var query = new URLSearchParams();
      var search = document.getElementById('templateSearch').value.trim();
      var status = document.getElementById('templateStatusFilter').value;
      if (search) query.set('search', search);
      if (status) query.set('status', status);
      query.set('limit', '500');
      var data = await templateApi('?' + query.toString());
      templates = data.templates || [];
      loaded = true;
      renderTemplates();
    } catch (error) {
      list.innerHTML = '<div class="empty">No se pudieron cargar las plantillas.</div>';
      crm.showToast(error.message, true);
    }
  }

  document.getElementById('syncTemplates').addEventListener('click', async function (event) {
    var button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Sincronizando…';
    try {
      var data = await templateApi('/sync', { method: 'POST', body: '{}' });
      crm.showToast('Plantillas sincronizadas: ' + String(data.synced || 0));
      await loadTemplates();
    } catch (error) {
      crm.showToast(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = 'Sincronizar con Meta';
    }
  });

  document.getElementById('templateSearch').addEventListener('input', function () {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(loadTemplates, 300);
  });
  document.getElementById('templateStatusFilter').addEventListener('change', loadTemplates);
  crm.registerLoader('templates', function () {
    if (!loaded) loadTemplates();
  });
})();
`;
