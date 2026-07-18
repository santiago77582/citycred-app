export const CRM_CORE_JS = String.raw`
(function () {
  'use strict';
  var statusNames = {
    NEW: 'Nuevo', PENDING: 'Pendiente', INTERESTED: 'Interesado',
    DOCUMENTATION_PENDING: 'Falta documentación', UNDER_REVIEW: 'En análisis',
    APPROVED: 'Aprobado', REJECTED: 'Rechazado', FINALIZED: 'Finalizado',
    DO_NOT_CONTACT: 'No contactar'
  };
  var state = { contacts: [], users: [], selected: null, loaders: {} };
  var toast = document.getElementById('toast');

  function showToast(message, error) {
    toast.textContent = message;
    toast.classList.toggle('error', Boolean(error));
    toast.classList.remove('hidden');
    window.setTimeout(function () { toast.classList.add('hidden'); }, 3200);
  }

  async function api(path, options) {
    var response = await fetch('/admin/api/crm' + path, Object.assign({
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }
    }, options || {}));
    if (response.status === 401) {
      window.location.href = '/admin/login';
      throw new Error('Sesión vencida');
    }
    var data = response.status === 204 ? {} : await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación');
    return data;
  }

  function text(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function setOptions(select, options, selectedValue) {
    select.innerHTML = options.map(function (item) {
      return '<option value="' + text(item.value) + '"' +
        (String(item.value) === String(selectedValue || '') ? ' selected' : '') + '>' +
        text(item.label) + '</option>';
    }).join('');
  }

  async function loadUsers() {
    var data = await api('/users');
    state.users = data.users || [];
    return state.users;
  }

  function renderContacts() {
    var list = document.getElementById('contactList');
    if (!state.contacts.length) {
      list.innerHTML = '<div class="empty">No hay clientes para mostrar.</div>';
      return;
    }
    list.innerHTML = state.contacts.map(function (contact) {
      var active = state.selected && state.selected.wa_id === contact.wa_id ? ' active' : '';
      return '<button class="contact-item' + active + '" data-waid="' + text(contact.wa_id) + '" type="button">' +
        '<div class="contact-name">' + text(contact.profile_name || contact.phone) + '</div>' +
        '<div class="contact-sub">' + text(contact.entity || 'Entidad sin registrar') + ' · ' + text(contact.phone) + '</div>' +
        '<span class="badge">' + text(statusNames[contact.commercial_status] || contact.commercial_status) + '</span>' +
        '</button>';
    }).join('');
    list.querySelectorAll('[data-waid]').forEach(function (button) {
      button.addEventListener('click', function () { selectContact(button.dataset.waid); });
    });
  }

  function fillContact(contact) {
    state.selected = contact;
    document.getElementById('contactForm').classList.remove('hidden');
    document.getElementById('contactTitle').textContent = contact.profile_name || contact.phone;
    document.getElementById('contactPhone').textContent = contact.phone;
    document.getElementById('profileName').value = contact.profile_name || '';
    document.getElementById('entity').value = contact.entity || '';
    document.getElementById('documentNumber').value = contact.document_number || '';
    document.getElementById('seniorityRange').value = contact.seniority_range || '';
    document.getElementById('availableQuota').value = contact.available_quota == null ? '' : contact.available_quota;
    document.getElementById('notes').value = contact.notes || '';
    document.getElementById('consentStatus').value = contact.consent_status || 'UNKNOWN';
    setOptions(document.getElementById('commercialStatus'), Object.keys(statusNames).map(function (key) {
      return { value: key, label: statusNames[key] };
    }), contact.commercial_status);
    var users = [{ value: '', label: 'Sin asignar' }].concat(state.users.filter(function (user) {
      return user.active;
    }).map(function (user) { return { value: user.id, label: user.display_name }; }));
    setOptions(document.getElementById('assignedUser'), users, contact.assigned_user_id);
    document.getElementById('openChat').href = '/admin?waId=' + encodeURIComponent(contact.wa_id);
    renderContacts();
  }

  async function selectContact(waId) {
    try {
      if (!state.users.length) await loadUsers();
      var data = await api('/contacts/' + encodeURIComponent(waId));
      fillContact(data.contact);
    } catch (error) { showToast(error.message, true); }
  }

  async function loadContacts() {
    try {
      var query = new URLSearchParams();
      var search = document.getElementById('contactSearch').value.trim();
      var status = document.getElementById('statusFilter').value;
      if (search) query.set('search', search);
      if (status) query.set('status', status);
      query.set('limit', '300');
      var data = await api('/contacts?' + query.toString());
      state.contacts = data.contacts || [];
      renderContacts();
      if (state.selected) {
        var exists = state.contacts.some(function (item) { return item.wa_id === state.selected.wa_id; });
        if (!exists) {
          state.selected = null;
          document.getElementById('contactForm').classList.add('hidden');
        }
      }
    } catch (error) { showToast(error.message, true); }
  }

  document.getElementById('contactForm').addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!state.selected) return;
    try {
      var quotaRaw = document.getElementById('availableQuota').value;
      var patch = {
        profileName: document.getElementById('profileName').value.trim() || null,
        entity: document.getElementById('entity').value.trim() || null,
        documentNumber: document.getElementById('documentNumber').value.trim() || null,
        seniorityRange: document.getElementById('seniorityRange').value.trim() || null,
        availableQuota: quotaRaw === '' ? null : Number(quotaRaw),
        commercialStatus: document.getElementById('commercialStatus').value,
        consentStatus: document.getElementById('consentStatus').value,
        notes: document.getElementById('notes').value.trim() || null
      };
      var currentAssignment = state.selected.assigned_user_id || '';
      var nextAssignment = document.getElementById('assignedUser').value;
      var data = await api('/contacts/' + encodeURIComponent(state.selected.wa_id), {
        method: 'PATCH', body: JSON.stringify(patch)
      });
      if (currentAssignment !== nextAssignment) {
        await api('/contacts/' + encodeURIComponent(state.selected.wa_id) + '/assignment', {
          method: 'PUT', body: JSON.stringify({ userId: nextAssignment || null, source: 'MANUAL' })
        });
        data.contact.assigned_user_id = nextAssignment || null;
      }
      fillContact(data.contact);
      await loadContacts();
      showToast('Ficha guardada');
    } catch (error) { showToast(error.message, true); }
  });

  document.querySelectorAll('.menu-item').forEach(function (button) {
    button.addEventListener('click', function () {
      document.querySelectorAll('.menu-item').forEach(function (item) { item.classList.remove('active'); });
      document.querySelectorAll('.view').forEach(function (view) { view.classList.add('hidden'); });
      button.classList.add('active');
      document.getElementById(button.dataset.view + 'View').classList.remove('hidden');
      if (state.loaders[button.dataset.view]) state.loaders[button.dataset.view]();
    });
  });

  document.getElementById('refreshContacts').addEventListener('click', loadContacts);
  var searchTimer;
  document.getElementById('contactSearch').addEventListener('input', function () {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(loadContacts, 300);
  });
  document.getElementById('statusFilter').addEventListener('change', loadContacts);
  document.getElementById('logoutButton').addEventListener('click', async function () {
    await fetch('/admin/logout', { method: 'POST', credentials: 'same-origin' });
    window.location.href = '/admin/login';
  });

  window.CityCredCrm = {
    api: api, text: text, showToast: showToast, state: state,
    registerLoader: function (name, loader) { state.loaders[name] = loader; }
  };
  Promise.all([loadUsers(), loadContacts()]).catch(function (error) { showToast(error.message, true); });
})();
`;
