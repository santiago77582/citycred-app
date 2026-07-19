export const PLATFORM_CORE_JS = String.raw`
(function () {
  'use strict';
  var toast = document.getElementById('toast');
  window.CityCredPlatform = {
    selectedFlow: null,
    element: function (id) { return document.getElementById(id); },
    value: function (id) { return String(document.getElementById(id).value || '').trim(); },
    checked: function (id) { return Boolean(document.getElementById(id).checked); },
    pretty: function (input) { return JSON.stringify(input == null ? null : input, null, 2); },
    escapeHtml: function (input) {
      return String(input == null ? '' : input)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    },
    dateText: function (input) {
      if (!input) return '—';
      var date = new Date(input);
      return Number.isNaN(date.getTime()) ? String(input) : date.toLocaleString('es-AR');
    },
    showToast: function (message, error) {
      toast.textContent = message;
      toast.classList.toggle('error', Boolean(error));
      toast.classList.remove('hidden');
      window.setTimeout(function () { toast.classList.add('hidden'); }, 4200);
    },
    setLoading: function (active) { document.body.classList.toggle('loading', Boolean(active)); },
    api: async function (path, options) {
      var response = await fetch('/admin/api/platform' + path, Object.assign({
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' }
      }, options || {}));
      if (response.status === 401) {
        window.location.href = '/admin/login';
        throw new Error('Sesión vencida');
      }
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(data.error || data.message || 'No se pudo completar la operación');
      return data;
    },
    apiRaw: async function (path, body, contentType) {
      var response = await fetch('/admin/api/platform' + path, {
        method: 'POST', credentials: 'same-origin', body: body,
        headers: { 'content-type': contentType }
      });
      if (response.status === 401) {
        window.location.href = '/admin/login';
        throw new Error('Sesión vencida');
      }
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación');
      return data;
    },
    guarded: async function (work) {
      window.CityCredPlatform.setLoading(true);
      try { return await work(); }
      catch (error) {
        window.CityCredPlatform.showToast(error instanceof Error ? error.message : String(error), true);
        throw error;
      } finally { window.CityCredPlatform.setLoading(false); }
    },
    rowsTable: function (headers, rows) {
      var escape = window.CityCredPlatform.escapeHtml;
      if (!rows.length) return '<div class="muted" style="padding:14px">Sin registros.</div>';
      return '<table><thead><tr>' + headers.map(function (header) {
        return '<th>' + escape(header.label) + '</th>';
      }).join('') + '</tr></thead><tbody>' + rows.map(function (row) {
        return '<tr>' + headers.map(function (header) {
          var content = typeof header.render === 'function' ? header.render(row) : row[header.key];
          return '<td>' + escape(content == null ? '—' : content) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
    },
    confirmAction: function (message) { return window.confirm(message); }
  };

  document.querySelectorAll('.menu-item').forEach(function (button) {
    button.addEventListener('click', function () {
      document.querySelectorAll('.menu-item').forEach(function (item) { item.classList.remove('active'); });
      document.querySelectorAll('.view').forEach(function (view) { view.classList.add('hidden'); });
      button.classList.add('active');
      document.getElementById(button.dataset.view + 'View').classList.remove('hidden');
    });
  });
  document.getElementById('logoutButton').addEventListener('click', async function () {
    await fetch('/admin/logout', { method: 'POST', credentials: 'same-origin' });
    window.location.href = '/admin/login';
  });
})();
`;
