import { CRM_ATTACHMENTS_JS } from './crmClientAttachments.js';
import { CRM_LABELS_JS } from './crmClientLabels.js';

export const CRM_SETTINGS_JS = String.raw`
(function () {
  'use strict';
  var crm = window.CityCredCrm;

  function card(title, meta, action) {
    return '<article class="card"><div class="card-title">' + crm.text(title) + '</div>' +
      '<div class="card-meta">' + meta + '</div>' + (action || '') + '</article>';
  }

  async function loadTeam() {
    try {
      var data = await crm.api('/users');
      crm.state.users = data.users || [];
      var list = document.getElementById('userList');
      list.innerHTML = crm.state.users.length ? crm.state.users.map(function (user) {
        var role = user.role === 'ADMIN' ? 'Administrador' : user.role === 'SUPERVISOR' ? 'Supervisor' : 'Asesor';
        var status = user.active ? 'Activo' : 'Inactivo';
        var action = '<button class="secondary user-toggle" data-user="' + crm.text(user.id) + '" data-active="' +
          String(!user.active) + '" type="button">' + (user.active ? 'Desactivar' : 'Reactivar') + '</button>';
        return card(user.display_name, crm.text(user.email) + '<br>' + crm.text(role) + ' · ' + crm.text(status), action);
      }).join('') : '<div class="empty">Todavía no hay usuarios creados.</div>';
      list.querySelectorAll('.user-toggle').forEach(function (button) {
        button.addEventListener('click', async function () {
          try {
            await crm.api('/users/' + encodeURIComponent(button.dataset.user), {
              method: 'PATCH', body: JSON.stringify({ active: button.dataset.active === 'true' })
            });
            crm.showToast('Usuario actualizado');
            await loadTeam();
          } catch (error) { crm.showToast(error.message, true); }
        });
      });
    } catch (error) { crm.showToast(error.message, true); }
  }

  async function loadLabels() {
    try {
      var data = await crm.api('/labels');
      var labels = data.labels || [];
      document.getElementById('labelList').innerHTML = labels.length ? labels.map(function (label) {
        var dot = '<span class="label-dot" style="background:' + crm.text(label.color || '#5b36c9') + '"></span>';
        return card('<span class="label-chip">' + dot + crm.text(label.name) + '</span>', crm.text(label.description || 'Sin descripción'));
      }).join('') : '<div class="empty">Todavía no hay etiquetas.</div>';
    } catch (error) { crm.showToast(error.message, true); }
  }

  async function loadQuickReplies() {
    try {
      var data = await crm.api('/quick-replies');
      var replies = data.quickReplies || [];
      document.getElementById('quickReplyList').innerHTML = replies.length ? replies.map(function (reply) {
        var meta = '<strong>' + crm.text(reply.shortcut) + '</strong> · ' + crm.text(reply.category || 'Sin categoría') +
          '<br><br>' + crm.text(reply.body).replace(/\n/g, '<br>');
        return card(reply.title, meta);
      }).join('') : '<div class="empty">Todavía no hay respuestas rápidas.</div>';
    } catch (error) { crm.showToast(error.message, true); }
  }

  document.getElementById('userForm').addEventListener('submit', async function (event) {
    event.preventDefault();
    try {
      await crm.api('/users', {
        method: 'POST',
        body: JSON.stringify({
          displayName: document.getElementById('userName').value.trim(),
          email: document.getElementById('userEmail').value.trim(),
          role: document.getElementById('userRole').value,
          password: document.getElementById('userPassword').value
        })
      });
      event.target.reset();
      crm.showToast('Usuario creado');
      await loadTeam();
    } catch (error) { crm.showToast(error.message, true); }
  });

  document.getElementById('labelForm').addEventListener('submit', async function (event) {
    event.preventDefault();
    try {
      await crm.api('/labels', {
        method: 'POST',
        body: JSON.stringify({
          name: document.getElementById('labelName').value.trim(),
          description: document.getElementById('labelDescription').value.trim() || null,
          color: document.getElementById('labelColor').value
        })
      });
      event.target.reset();
      document.getElementById('labelColor').value = '#5b36c9';
      crm.showToast('Etiqueta creada');
      await loadLabels();
    } catch (error) { crm.showToast(error.message, true); }
  });

  document.getElementById('quickReplyForm').addEventListener('submit', async function (event) {
    event.preventDefault();
    try {
      await crm.api('/quick-replies', {
        method: 'POST',
        body: JSON.stringify({
          shortcut: document.getElementById('quickShortcut').value.trim(),
          title: document.getElementById('quickTitle').value.trim(),
          category: document.getElementById('quickCategory').value.trim() || null,
          body: document.getElementById('quickBody').value.trim()
        })
      });
      event.target.reset();
      crm.showToast('Respuesta rápida guardada');
      await loadQuickReplies();
    } catch (error) { crm.showToast(error.message, true); }
  });

  crm.registerLoader('team', loadTeam);
  crm.registerLoader('labels', loadLabels);
  crm.registerLoader('quickReplies', loadQuickReplies);
})();
` + '\n' + CRM_LABELS_JS + '\n' + CRM_ATTACHMENTS_JS;
