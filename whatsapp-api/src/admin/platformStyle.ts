export const PLATFORM_CSS = String.raw`
:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --bg: #f4f6fb;
  --panel: #ffffff;
  --border: #dfe4ee;
  --muted: #667085;
  --text: #172033;
  --brand: #5b36c9;
  --brand-dark: #40209d;
  --danger: #b42318;
  --warning: #b54708;
  --success: #18794e;
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; background: var(--bg); color: var(--text); }
button, input, textarea, select { font: inherit; }
button { cursor: pointer; }
.topbar { min-height: 66px; padding: 12px 22px; background: white; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 22px; position: sticky; top: 0; z-index: 20; }
.brand { color: var(--text); text-decoration: none; font-size: 20px; font-weight: 900; display: inline-flex; align-items: center; gap: 9px; }
.brand-mark { width: 34px; height: 34px; border-radius: 11px; display: grid; place-items: center; background: var(--brand); color: white; }
.topbar nav { display: flex; gap: 6px; flex: 1; flex-wrap: wrap; }
.topbar nav a { text-decoration: none; color: var(--muted); padding: 9px 11px; border-radius: 9px; font-weight: 750; }
.topbar nav a:hover, .topbar nav a.active { background: #f1edff; color: var(--brand-dark); }
.ghost, .secondary, .danger, .primary { border-radius: 10px; padding: 9px 13px; font-weight: 800; }
.ghost, .secondary { border: 1px solid var(--border); background: white; color: var(--text); }
.primary { border: 0; background: var(--brand); color: white; }
.primary:hover { background: var(--brand-dark); }
.danger { border: 1px solid #fda29b; background: #fff1f0; color: var(--danger); }
.layout { width: min(1500px, 100%); margin: 0 auto; padding: 24px; display: grid; grid-template-columns: 230px minmax(0, 1fr); gap: 22px; }
.menu { background: white; border: 1px solid var(--border); border-radius: 16px; padding: 9px; align-self: start; position: sticky; top: 90px; }
.menu-item { width: 100%; border: 0; background: transparent; color: var(--muted); border-radius: 10px; text-align: left; padding: 12px; font-weight: 800; }
.menu-item:hover, .menu-item.active { background: #f1edff; color: var(--brand-dark); }
.content { min-width: 0; }
.view { display: grid; gap: 18px; }
.hidden { display: none !important; }
.view-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
h1, h2, h3 { margin: 0; }
h1 { font-size: 26px; }
h2 { font-size: 19px; }
h3 { font-size: 15px; }
p { line-height: 1.5; }
.view-head p, .muted { color: var(--muted); margin: 5px 0 0; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.card { background: white; border: 1px solid var(--border); border-radius: 16px; padding: 18px; min-width: 0; }
.card.wide { grid-column: 1 / -1; }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.status-pill { display: inline-flex; align-items: center; gap: 6px; padding: 6px 9px; border-radius: 999px; background: #f2f4f7; font-weight: 800; font-size: 12px; }
.status-pill.on, .status-pill.good { color: var(--success); background: #eafaf2; }
.status-pill.off { color: var(--muted); }
.status-pill.warn { color: var(--warning); background: #fff4e5; }
.status-pill.bad { color: var(--danger); background: #fff1f0; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 13px; }
.form-grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
label { display: grid; gap: 6px; font-size: 13px; font-weight: 800; color: #344054; }
label.wide, .wide { grid-column: 1 / -1; }
input, textarea, select { width: 100%; border: 1px solid var(--border); border-radius: 10px; padding: 10px 11px; background: white; color: var(--text); outline: none; }
input:focus, textarea:focus, select:focus { border-color: var(--brand); box-shadow: 0 0 0 3px rgba(91,54,201,.12); }
textarea { resize: vertical; min-height: 92px; }
.actions { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 14px; }
.switch-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; border: 1px solid var(--border); border-radius: 12px; padding: 12px; }
.switch-row input { width: 20px; height: 20px; }
.notice { border-radius: 12px; padding: 12px 14px; background: #f8f5ff; border: 1px solid #ddd3ff; color: #43259b; }
.notice.warning { background: #fff8eb; border-color: #fedf89; color: #93370d; }
.notice.danger { background: #fff1f0; border-color: #fda29b; color: var(--danger); }
.kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.kpi { background: white; border: 1px solid var(--border); border-radius: 14px; padding: 14px; }
.kpi span { color: var(--muted); font-size: 12px; font-weight: 700; }
.kpi strong { display: block; margin-top: 7px; font-size: 20px; overflow-wrap: anywhere; }
.table-wrap { overflow: auto; border: 1px solid var(--border); border-radius: 12px; }
table { width: 100%; border-collapse: collapse; min-width: 720px; }
th, td { border-bottom: 1px solid var(--border); padding: 10px; text-align: left; vertical-align: top; font-size: 13px; }
th { background: #f8fafc; color: #475467; position: sticky; top: 0; }
tr:last-child td { border-bottom: 0; }
pre { background: #101828; color: #e4e7ec; border-radius: 12px; padding: 14px; overflow: auto; max-height: 440px; font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
.tabs { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 14px; }
.tab { border: 1px solid var(--border); border-radius: 999px; background: white; padding: 8px 11px; font-weight: 800; color: var(--muted); }
.tab.active { color: white; background: var(--brand); border-color: var(--brand); }
.list { display: grid; gap: 9px; }
.list-item { border: 1px solid var(--border); border-radius: 12px; padding: 12px; background: #fff; }
.list-item button { margin-top: 8px; }
.toast { position: fixed; right: 22px; bottom: 22px; padding: 12px 16px; border-radius: 12px; color: white; background: #1d2939; box-shadow: 0 12px 30px rgba(16,24,40,.2); z-index: 50; max-width: min(420px, calc(100vw - 44px)); }
.toast.error { background: var(--danger); }
.loading { opacity: .55; pointer-events: none; }
@media (max-width: 1000px) {
  .layout { grid-template-columns: 1fr; }
  .menu { position: static; display: flex; overflow: auto; }
  .menu-item { width: auto; white-space: nowrap; }
  .grid, .grid.three, .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 680px) {
  .topbar { padding: 10px 12px; gap: 10px; }
  .topbar nav { order: 3; width: 100%; overflow: auto; flex-wrap: nowrap; }
  .topbar { flex-wrap: wrap; }
  .layout { padding: 14px; }
  .grid, .grid.three, .kpis, .form-grid, .form-grid.three { grid-template-columns: 1fr; }
  .card { padding: 14px; }
  .view-head { display: grid; }
}
`;
