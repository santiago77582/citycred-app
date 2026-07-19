export const PLATFORM_INIT_JS = String.raw`
(function () {
  'use strict';
  var P = window.CityCredPlatform;
  P.guarded(async function () {
    await Promise.allSettled([
      P.loadOverview(),
      P.loadBot(),
      P.loadAccount(),
      P.loadCommerce(),
      P.loadFlows()
    ]);
  }).catch(function () {});
})();
`;

export const PLATFORM_NAV_JS = String.raw`
(function () {
  'use strict';
  async function installNavigation() {
    var response = await fetch('/admin/api/session', { credentials: 'same-origin' });
    if (!response.ok) return;
    var session = await response.json();
    var isAdmin = session.accessRole === 'ADMIN';
    document.querySelectorAll('[data-admin-only]').forEach(function (element) {
      element.classList.toggle('hidden', !isAdmin);
    });
  }
  installNavigation().catch(function () {});
})();
`;
