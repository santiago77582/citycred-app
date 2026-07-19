export const PLATFORM_INIT_JS = String.raw`
(function () {
  'use strict';
  var P = window.CityCredPlatform;
  P.guarded(async function () {
    await Promise.all([
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
  function addLink(container, href, label) {
    if (!container || container.querySelector('a[href="' + href + '"]')) return;
    var link = document.createElement('a');
    link.href = href;
    link.textContent = label;
    link.style.cssText = 'text-decoration:none;color:#5b36c9;font-weight:800;padding:7px 9px;border:1px solid #dfe4ee;border-radius:9px;background:#fff';
    container.appendChild(link);
  }
  var dashboardHead = document.querySelector('.sidebar-head');
  if (dashboardHead) {
    var dashboardNav = document.createElement('div');
    dashboardNav.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
    addLink(dashboardNav, '/admin/crm', 'CRM');
    addLink(dashboardNav, '/admin/platform', 'Plataforma');
    dashboardHead.appendChild(dashboardNav);
  }
  addLink(document.querySelector('.topbar nav'), '/admin/platform', 'Plataforma');
})();
`;
