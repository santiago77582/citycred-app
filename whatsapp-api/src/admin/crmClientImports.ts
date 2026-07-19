export const CRM_IMPORTS_JS = String.raw`
(function () {
  'use strict';
  var crm = window.CityCredCrm;
  var selectedBatchId = null;

  function showPanel(visible) {
    document.getElementById('contactImportPanel').classList.toggle('hidden', !visible);
    if (!visible) {
      selectedBatchId = null;
      document.getElementById('contactImportFile').value = '';
      document.getElementById('commitContactImport').classList.add('hidden');
      document.getElementById('contactImportResult').innerHTML = 'Todavía no se revisó ningún archivo.';
    }
  }

  function rowLabel(row) {
    var status = row.status === 'VALID' ? 'Válida' : row.status === 'DUPLICATE' ? 'Duplicada' : 'Inválida';
    return '<li><strong>Fila ' + String(row.row_number) + ' · ' + crm.text(status) + '</strong>' +
      (row.normalized_phone ? ' · ' + crm.text(row.normalized_phone) : '') +
      (row.error_message ? '<span>' + crm.text(row.error_message) + '</span>' : '') + '</li>';
  }

  function renderPreview(data) {
    var batch = data.batch || {};
    var rows = data.rows || [];
    selectedBatchId = batch.id || null;
    document.getElementById('contactImportResult').innerHTML =
      '<div class="contact-import-summary">' +
        '<div><strong>' + String(batch.totalRows || 0) + '</strong><span>Filas</span></div>' +
        '<div><strong>' + String(batch.validRows || 0) + '</strong><span>Válidas</span></div>' +
        '<div><strong>' + String(batch.invalidRows || 0) + '</strong><span>Inválidas</span></div>' +
        '<div><strong>' + String(batch.duplicateRows || 0) + '</strong><span>Duplicadas</span></div>' +
      '</div>' +
      '<p class="contact-import-warning"><strong>No se modificó ningún cliente.</strong> ' +
        'Consentimiento vacío queda sin registrar; otorgado exige fecha explícita.</p>' +
      '<ul class="contact-import-rows">' + rows.map(rowLabel).join('') + '</ul>';
    document.getElementById('commitContactImport').classList.toggle(
      'hidden', !selectedBatchId || Number(batch.validRows || 0) < 1
    );
  }

  async function previewFile() {
    var file = document.getElementById('contactImportFile').files[0];
    if (!file) {
      crm.showToast('Elegí un archivo CSV o Excel.', true);
      return;
    }
    var extension = file.name.toLowerCase().split('.').pop();
    if (['csv', 'xlsx'].indexOf(extension) === -1) {
      crm.showToast('Solo se aceptan archivos .csv o .xlsx.', true);
      return;
    }
    var button = document.getElementById('previewContactImport');
    button.disabled = true;
    button.textContent = 'Revisando…';
    try {
      var response = await fetch('/admin/api/imports/preview', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': extension === 'csv'
            ? 'text/csv'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'x-file-name': encodeURIComponent(file.name)
        },
        body: file
      });
      if (response.status === 401) window.location.href = '/admin/login';
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(data.error || 'No se pudo revisar el archivo');
      renderPreview(data);
      crm.showToast('Vista previa lista. Ningún cliente fue modificado.');
    } catch (error) {
      crm.showToast(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = 'Revisar archivo';
    }
  }

  async function commitImport() {
    if (!selectedBatchId) return;
    if (!window.confirm('Confirmar la importación de las filas válidas. Las bajas existentes quedarán protegidas.')) return;
    var button = document.getElementById('commitContactImport');
    button.disabled = true;
    button.textContent = 'Importando…';
    try {
      var response = await fetch('/admin/api/imports/' + encodeURIComponent(selectedBatchId) + '/commit', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmation: 'IMPORTAR' })
      });
      if (response.status === 401) window.location.href = '/admin/login';
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(data.error || 'No se pudo importar');
      var summary = data.batch && data.batch.summary || {};
      document.getElementById('contactImportResult').innerHTML =
        '<p class="contact-import-success"><strong>Importación completada.</strong> ' +
        String(summary.created || 0) + ' creados, ' + String(summary.updated || 0) +
        ' actualizados y ' + String(summary.skipped || 0) + ' omitidos.</p>';
      button.classList.add('hidden');
      document.getElementById('refreshContacts').click();
      crm.showToast('Clientes importados.');
    } catch (error) {
      crm.showToast(error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = 'Confirmar importación';
    }
  }

  document.getElementById('openContactImport').addEventListener('click', function () { showPanel(true); });
  document.getElementById('closeContactImport').addEventListener('click', function () { showPanel(false); });
  document.getElementById('previewContactImport').addEventListener('click', previewFile);
  document.getElementById('commitContactImport').addEventListener('click', commitImport);
})();
`;
