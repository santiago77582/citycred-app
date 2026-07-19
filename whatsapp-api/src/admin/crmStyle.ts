export const CRM_CSS = String.raw`
:root {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --bg: #f4f6fb; --panel: #fff; --border: #dfe4ee; --text: #172033;
  --muted: #667085; --brand: #5b36c9; --brand-dark: #40209d; --danger: #b42318;
}
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text); }
button, input, select, textarea { font: inherit; }
button { cursor: pointer; }
a { color: inherit; text-decoration: none; }
.topbar { height: 68px; display: flex; align-items: center; gap: 28px; padding: 0 24px; background: #fff; border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 5; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 900; font-size: 20px; }
.brand-mark { width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; color: #fff; background: var(--brand); }
nav { display: flex; gap: 8px; flex: 1; }
nav a { padding: 10px 13px; border-radius: 10px; color: var(--muted); font-weight: 750; }
nav a:hover, nav a.active { color: var(--brand); background: #f1edff; }
.ghost, .secondary { border: 1px solid var(--border); background: #fff; border-radius: 10px; padding: 9px 12px; color: var(--text); }
.layout { min-height: calc(100vh - 68px); display: grid; grid-template-columns: 220px minmax(0,1fr); }
.menu { padding: 22px 14px; border-right: 1px solid var(--border); background: #fff; display: flex; flex-direction: column; gap: 7px; }
.menu-item { border: 0; background: transparent; text-align: left; border-radius: 10px; padding: 12px 14px; font-weight: 750; color: var(--muted); }
.menu-item:hover, .menu-item.active { background: #f1edff; color: var(--brand); }
.content { padding: 28px; min-width: 0; }
.view { max-width: 1450px; margin: 0 auto; }
.view-head { display: flex; align-items: start; justify-content: space-between; gap: 20px; margin-bottom: 20px; }
.view-head-actions, .contact-import-actions { display: flex; flex-wrap: wrap; gap: 9px; }
.contact-import-panel { margin: 0 0 16px; padding: 18px; border: 1px solid var(--border); border-radius: 16px; background: #fff; }
.contact-import-panel h2 { margin-bottom: 5px; }
.contact-import-panel p { margin-bottom: 14px; color: var(--muted); }
.contact-import-file { display: grid; gap: 7px; margin: 14px 0; color: var(--muted); font-size: 13px; font-weight: 750; }
.contact-import-result { margin-top: 14px; }
.contact-import-summary { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 8px; }
.contact-import-summary > div { display: grid; gap: 3px; padding: 11px; border-radius: 10px; background: #f8f7ff; text-align: center; }
.contact-import-summary strong { font-size: 22px; color: var(--brand-dark); }
.contact-import-summary span { font-size: 12px; }
.contact-import-warning, .contact-import-success { margin: 12px 0 !important; padding: 11px; border-radius: 10px; background: #fff7df; color: #7a4b00 !important; }
.contact-import-success { background: #dcfae6; color: #166534 !important; }
.contact-import-rows { max-height: 220px; overflow: auto; margin: 0; padding: 0; list-style: none; border: 1px solid var(--border); border-radius: 10px; }
.contact-import-rows li { padding: 9px 11px; border-bottom: 1px solid #eef1f6; font-size: 13px; }
.contact-import-rows li:last-child { border-bottom: 0; }
.contact-import-rows span { display: block; margin-top: 3px; color: var(--danger); }
h1, h2, h3, p { margin-top: 0; }
h1 { margin-bottom: 6px; font-size: 28px; }
h2 { margin-bottom: 4px; font-size: 20px; }
.view-head p, .muted { color: var(--muted); }
.filters, .inline-form { display: grid; grid-template-columns: minmax(220px,1fr) 220px auto; gap: 10px; margin-bottom: 16px; }
input, select, textarea { width: 100%; border: 1px solid var(--border); border-radius: 10px; padding: 11px 12px; background: #fff; color: var(--text); outline: none; }
input:focus, select:focus, textarea:focus { border-color: var(--brand); box-shadow: 0 0 0 3px rgba(91,54,201,.12); }
.primary { border: 0; border-radius: 10px; padding: 11px 16px; background: var(--brand); color: #fff; font-weight: 850; }
.primary:hover { background: var(--brand-dark); }
.split { min-height: 610px; display: grid; grid-template-columns: minmax(280px, 390px) minmax(0,1fr); gap: 16px; }
.list-panel, .detail-panel, .stack-form, .card { background: #fff; border: 1px solid var(--border); border-radius: 16px; }
.list-panel { overflow: auto; }
.contact-item { width: 100%; border: 0; border-bottom: 1px solid #eef1f6; background: #fff; padding: 15px 16px; text-align: left; }
.contact-item:last-child { border-bottom: 0; }
.contact-item:hover, .contact-item.active { background: #f1edff; }
.contact-name { font-weight: 850; }
.contact-sub { margin-top: 4px; color: var(--muted); font-size: 13px; }
.badge { display: inline-flex; margin-top: 8px; border-radius: 999px; padding: 4px 8px; background: #eef1f6; font-size: 12px; font-weight: 750; }
.detail-panel { padding: 22px; }
.detail-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
.link-button { display: inline-flex; align-items: center; }
.form-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 14px; }
.form-grid label { display: grid; gap: 7px; color: var(--muted); font-size: 13px; font-weight: 750; }
.form-grid .wide { grid-column: 1 / -1; }
.field-title { color: var(--muted); font-size: 13px; font-weight: 750; margin-bottom: 8px; }
.label-options { display: flex; flex-wrap: wrap; gap: 8px; }
.label-option { display: inline-flex !important; grid-auto-flow: column; align-items: center; width: auto; gap: 7px !important; border: 1px solid var(--border); border-radius: 999px; padding: 7px 10px; color: var(--text) !important; background: #fff; }
.label-option input { width: auto; margin: 0; accent-color: var(--brand); }
.attachment-section { margin-top: 22px; padding-top: 20px; border-top: 1px solid var(--border); }
.attachment-head { display: flex; align-items: start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.attachment-head h3 { margin-bottom: 4px; font-size: 17px; }
.attachment-head p { margin-bottom: 0; color: var(--muted); font-size: 13px; }
.attachment-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(190px,1fr)); gap: 12px; }
.attachment-card { min-width: 0; border: 1px solid var(--border); border-radius: 12px; padding: 10px; background: #fafbff; }
.attachment-image, .attachment-video { width: 100%; height: 150px; border-radius: 9px; object-fit: cover; background: #e9edf5; }
.attachment-audio { width: 100%; min-height: 42px; }
.attachment-document { min-height: 110px; display: grid; place-items: center; gap: 8px; border: 1px dashed var(--border); border-radius: 9px; color: var(--brand); font-weight: 800; text-align: center; padding: 12px; }
.attachment-icon { width: 46px; height: 46px; border-radius: 10px; display: grid; place-items: center; background: #efeaff; }
.attachment-name { margin-top: 9px; font-weight: 800; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.attachment-caption { margin-top: 4px; color: var(--muted); font-size: 12px; line-height: 1.35; }
.actions { display: flex; justify-content: flex-end; margin-top: 18px; }
.inline-form { grid-template-columns: repeat(4,minmax(140px,1fr)) auto; background: #fff; border: 1px solid var(--border); border-radius: 16px; padding: 16px; }
.stack-form { padding: 18px; margin-bottom: 16px; }
.stack-form > .primary { margin-top: 14px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill,minmax(260px,1fr)); gap: 14px; }
.card { padding: 16px; }
.card-title { font-weight: 850; }
.card-meta { margin-top: 6px; color: var(--muted); font-size: 13px; line-height: 1.45; }
.label-chip { display: inline-flex; align-items: center; gap: 7px; }
.label-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--brand); flex: 0 0 auto; }
.toast { position: fixed; right: 22px; bottom: 22px; padding: 12px 16px; border-radius: 12px; background: #1d2939; color: #fff; box-shadow: 0 12px 30px rgba(16,24,40,.2); }
.toast.error { background: var(--danger); }
.hidden { display: none !important; }
.empty { padding: 28px; color: var(--muted); text-align: center; }
@media (max-width: 900px) {
  .layout { grid-template-columns: 1fr; }
  .menu { border-right: 0; border-bottom: 1px solid var(--border); flex-direction: row; overflow-x: auto; padding: 10px; }
  .menu-item { white-space: nowrap; }
  .content { padding: 16px; }
  .split { grid-template-columns: 1fr; min-height: 0; }
  .list-panel { max-height: 360px; }
  .inline-form { grid-template-columns: 1fr; }
}
@media (max-width: 620px) {
  .topbar { padding: 0 12px; gap: 12px; }
  nav { display: none; }
  .form-grid, .filters { grid-template-columns: 1fr; }
  .attachment-grid { grid-template-columns: 1fr; }
  .contact-import-summary { grid-template-columns: repeat(2,minmax(0,1fr)); }
}
`;
