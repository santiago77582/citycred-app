export const CRM_LABELS_JS = String.raw`
(function () {
  'use strict';
  var crm = window.CityCredCrm;
  var catalog = [];
  var notesLabel = document.getElementById('notes').closest('label');
  var block = document.createElement('div');
  block.className = 'wide';
  block.innerHTML = '<div class="field-title">Etiquetas</div><div id="contactLabelOptions" class="label-options"></div>';
  notesLabel.after(block);

  async function loadCatalog() {
    var data = await crm.api('/labels');
    catalog = data.labels || [];
    return catalog;
  }

  async function render(contact, selectedLabels) {
    try {
      if (!catalog.length) await loadCatalog();
      var selected = new Set((selectedLabels || []).map(function (label) { return label.id; }));
      var options = document.getElementById('contactLabelOptions');
      options.innerHTML = catalog.length ? catalog.map(function (label) {
        return '<label class="label-option"><input type="checkbox" data-label="' + crm.text(label.id) + '"' +
          (selected.has(label.id) ? ' checked' : '') + '><span class="label-dot" style="background:' +
          crm.text(label.color || '#5b36c9') + '"></span>' + crm.text(label.name) + '</label>';
      }).join('') : '<span class="muted">Creá etiquetas desde la sección Etiquetas.</span>';

      options.querySelectorAll('[data-label]').forEach(function (input) {
        input.addEventListener('change', async function () {
          input.disabled = true;
          try {
            await crm.api('/contacts/' + encodeURIComponent(contact.wa_id) + '/labels/' + encodeURIComponent(input.dataset.label), {
              method: input.checked ? 'PUT' : 'DELETE'
            });
            crm.showToast(input.checked ? 'Etiqueta agregada' : 'Etiqueta quitada');
          } catch (error) {
            input.checked = !input.checked;
            crm.showToast(error.message, true);
          } finally {
            input.disabled = false;
          }
        });
      });
    } catch (error) { crm.showToast(error.message, true); }
  }

  crm.registerContactHook(render);
  crm.registerLoader('labels', async function () {
    catalog = [];
    await loadCatalog();
  });
})();
`;
