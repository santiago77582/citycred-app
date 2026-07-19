export const PLATFORM_ACCOUNT_JS = String.raw`
(function () {
  'use strict';
  var P = window.CityCredPlatform;
  var E = P.element;
  var V = P.value;

  function profileEnvelope(data) {
    var list = data && data.profile && Array.isArray(data.profile.data) ? data.profile.data : [];
    var first = list[0] || {};
    return first.business_profile || first;
  }

  async function loadAccountEvents() {
    var query = new URLSearchParams({ limit: '150' });
    if (V('accountEventFilter')) query.set('field', V('accountEventFilter'));
    var data = await P.api('/account/events?' + query.toString());
    E('accountEventsTable').innerHTML = P.rowsTable([
      { label: 'Fecha', render: function (row) { return P.dateText(row.occurredAt || row.receivedAt); } },
      { label: 'Tipo', key: 'field' },
      { label: 'Evento', key: 'event' },
      { label: 'Número', key: 'displayPhoneNumber' },
      { label: 'Límite', key: 'currentLimit' },
      { label: 'Detalle', render: function (row) { return row.decision || row.rejectionReason || row.requestedVerifiedName || ''; } }
    ], data.events || []);
  }

  async function loadAccount() {
    var results = await Promise.all([
      P.api('/account/profile'),
      P.api('/account/phone-number'),
      P.api('/account/state')
    ]);
    var profile = profileEnvelope(results[0]);
    var phone = results[1].phoneNumber || {};
    var state = results[2].state || {};
    E('phoneStatusCards').innerHTML = [
      ['Nombre', phone.verified_name || 'Sin datos'],
      ['Número', phone.display_phone_number || 'Sin datos'],
      ['Calidad', phone.quality_rating || 'Sin datos'],
      ['Verificación', phone.code_verification_status || 'Sin datos'],
      ['Límite', state.quality && state.quality.currentLimit || 'Sin evento'],
      ['Último evento', state.quality && state.quality.event || 'Sin evento']
    ].map(function (item) {
      return '<div class="kpi"><span>' + P.escapeHtml(item[0]) + '</span><strong>' + P.escapeHtml(item[1]) + '</strong></div>';
    }).join('');
    E('profileAbout').value = profile.about || '';
    E('profileDescription').value = profile.description || '';
    E('profileAddress').value = profile.address || '';
    E('profileEmail').value = profile.email || '';
    E('profileVertical').value = profile.vertical || 'UNDEFINED';
    E('profileWebsites').value = Array.isArray(profile.websites) ? profile.websites.join('\n') : '';
    if (profile.profile_picture_url) E('profilePicturePreview').src = profile.profile_picture_url;
    await loadAccountEvents();
  }

  E('profileForm').addEventListener('submit', function (event) {
    event.preventDefault();
    if (!P.confirmAction('¿Confirmás modificar el perfil comercial visible en WhatsApp?')) return;
    P.guarded(async function () {
      var websites = V('profileWebsites').split(/\n+/).map(function (item) { return item.trim(); }).filter(Boolean);
      await P.api('/account/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          confirm: true,
          about: V('profileAbout') || null,
          description: V('profileDescription') || null,
          address: V('profileAddress') || null,
          email: V('profileEmail') || null,
          vertical: V('profileVertical') || null,
          websites: websites
        })
      });
      P.showToast('Perfil enviado a Meta.');
      await loadAccount();
    }).catch(function () {});
  });

  E('profilePictureForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var file = E('profilePictureFile').files[0];
    if (!file || !P.confirmAction('¿Confirmás reemplazar la foto comercial en WhatsApp?')) return;
    P.guarded(async function () {
      await P.apiRaw('/account/profile-picture?confirm=true', file, file.type);
      P.showToast('Foto cargada y enviada a Meta.');
      await loadAccount();
    }).catch(function () {});
  });

  E('accountEventFilter').addEventListener('change', function () { P.guarded(loadAccountEvents).catch(function () {}); });
  E('refreshAccount').addEventListener('click', function () { P.guarded(loadAccount).catch(function () {}); });

  async function loadCommerce() {
    var data = await P.api('/account/commerce-settings');
    var commerce = data.commerce || {};
    var settings = Array.isArray(commerce.data) ? commerce.data[0] || {} : commerce;
    E('catalogVisible').checked = Boolean(settings.is_catalog_visible);
    E('cartEnabled').checked = Boolean(settings.is_cart_enabled);
    E('commerceState').textContent = P.pretty(commerce);
  }

  E('commerceSettingsForm').addEventListener('submit', function (event) {
    event.preventDefault();
    if (!P.confirmAction('¿Confirmás cambiar la visibilidad del catálogo y el carrito?')) return;
    P.guarded(async function () {
      await P.api('/account/commerce-settings', {
        method: 'PATCH',
        body: JSON.stringify({
          confirm: true,
          cartEnabled: P.checked('cartEnabled'),
          catalogVisible: P.checked('catalogVisible')
        })
      });
      P.showToast('Configuración de comercio guardada.');
      await loadCommerce();
    }).catch(function () {});
  });

  function confirmSend(kind, to) {
    return P.confirmAction('¿Confirmás enviar ' + kind + ' al número ' + to + '? Esta acción usa WhatsApp real.');
  }

  E('productForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var to = V('productTo');
    if (!confirmSend('este producto', to)) return;
    P.guarded(async function () {
      await P.api('/commerce/product', {
        method: 'POST',
        body: JSON.stringify({
          to: to,
          catalogId: V('productCatalogId'),
          productRetailerId: V('productRetailerId'),
          body: V('productBody') || undefined
        })
      });
      P.showToast('Producto enviado.');
    }).catch(function () {});
  });

  E('catalogForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var to = V('catalogTo');
    if (!confirmSend('el catálogo', to)) return;
    P.guarded(async function () {
      await P.api('/commerce/catalog', {
        method: 'POST',
        body: JSON.stringify({
          to: to,
          body: V('catalogBody'),
          thumbnailProductRetailerId: V('catalogThumbnail') || undefined
        })
      });
      P.showToast('Catálogo enviado.');
    }).catch(function () {});
  });

  E('productListForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var to = V('productListTo');
    if (!confirmSend('la lista de productos', to)) return;
    P.guarded(async function () {
      var ids = V('productListIds').split(/\n+/).map(function (item) { return item.trim(); }).filter(Boolean);
      await P.api('/commerce/product-list', {
        method: 'POST',
        body: JSON.stringify({
          to: to,
          catalogId: V('productListCatalogId'),
          header: V('productListHeader'),
          body: V('productListBody'),
          sections: [{
            title: 'Productos',
            productItems: ids.map(function (id) { return { productRetailerId: id }; })
          }]
        })
      });
      P.showToast('Lista de productos enviada.');
    }).catch(function () {});
  });

  E('refreshCommerce').addEventListener('click', function () { P.guarded(loadCommerce).catch(function () {}); });
  P.loadAccount = loadAccount;
  P.loadCommerce = loadCommerce;
})();
`;
