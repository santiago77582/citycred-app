export const ANALYTICS_UI_CSS = String.raw`
.analytics-head { align-items: flex-end; }
.analytics-controls { display: grid; grid-template-columns: auto minmax(170px,220px) auto; align-items: center; gap: 9px; }
.analytics-controls label { color: var(--muted); font-size: 12px; font-weight: 800; }
.analytics-limit-notice { margin-bottom: 14px; padding: 11px 13px; border-radius: 11px; background: #fff1c2; color: #6b4600; font-weight: 750; }
.analytics-kpis { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 12px; margin-bottom: 16px; }
.analytics-kpi { min-height: 126px; display: grid; align-content: center; gap: 6px; padding: 16px; border: 1px solid var(--border); border-radius: 15px; background: #fff; }
.analytics-kpi span { color: var(--muted); font-size: 12px; font-weight: 800; }
.analytics-kpi strong { font-size: clamp(24px,3vw,34px); line-height: 1; overflow-wrap: anywhere; }
.analytics-kpi small { color: var(--muted); font-size: 11px; }
.analytics-loading { position: relative; overflow: hidden; background: #f4f6fa; }
.analytics-loading::after { content: ''; position: absolute; inset: 0; transform: translateX(-100%); background: linear-gradient(90deg,transparent,rgba(255,255,255,.8),transparent); animation: analytics-shimmer 1.2s infinite; }
@keyframes analytics-shimmer { to { transform: translateX(100%); } }
.analytics-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 14px; }
.analytics-panel { min-width: 0; padding: 16px; border: 1px solid var(--border); border-radius: 15px; background: #fff; }
.analytics-panel-wide { grid-column: 1 / -1; }
.analytics-panel h2 { margin: 0 0 14px; font-size: 17px; }
.analytics-panel-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.analytics-panel-head span { color: var(--muted); font-size: 12px; }
.analytics-empty { min-height: 90px; display: grid; place-items: center; color: var(--muted); text-align: center; }
.analytics-error { grid-column: 1 / -1; color: #b42318; }
.analytics-bars { display: grid; gap: 12px; }
.analytics-bar-row { display: grid; gap: 6px; }
.analytics-bar-label { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; }
.analytics-bar-label span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.analytics-bar-track { height: 9px; overflow: hidden; border-radius: 999px; background: #eef1f6; }
.analytics-bar-track span { display: block; height: 100%; border-radius: inherit; background: var(--brand); }
.analytics-chart-legend { display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 10px; color: var(--muted); font-size: 11px; }
.analytics-chart-legend span::before { content: ''; display: inline-block; width: 9px; height: 9px; margin-right: 5px; border-radius: 3px; vertical-align: -1px; }
.legend-inbound::before, .day-inbound { background: #5b36c9; }
.legend-outbound::before, .day-outbound { background: #18794e; }
.legend-failed::before, .day-failed { background: #b42318; }
.analytics-chart-scroll { overflow-x: auto; padding-bottom: 4px; }
.analytics-day-columns { min-width: 100%; width: max-content; height: 250px; display: flex; align-items: stretch; gap: 5px; padding: 8px 3px 0; border-bottom: 1px solid var(--border); }
.analytics-day { width: 24px; min-width: 24px; display: grid; grid-template-rows: minmax(0,1fr) 18px; gap: 4px; }
.analytics-day-bars { height: 100%; display: flex; align-items: flex-end; justify-content: center; gap: 2px; }
.analytics-day-bars span { width: 5px; min-height: 1px; border-radius: 3px 3px 0 0; }
.analytics-day small { color: var(--muted); font-size: 8px; text-align: center; white-space: nowrap; transform: translateX(-5px); }
.analytics-operation-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 12px; }
.analytics-operation-card { min-width: 0; padding: 13px; border: 1px solid var(--border); border-radius: 12px; background: #fafbff; }
.analytics-operation-card h3 { margin: 0 0 10px; font-size: 14px; }
.analytics-operation-card > div { display: flex; justify-content: space-between; gap: 8px; padding: 7px 0; border-bottom: 1px solid #e8ecf3; font-size: 12px; }
.analytics-operation-card > div:last-child { border-bottom: 0; }
.analytics-operation-card span { min-width: 0; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.analytics-operation-card strong { text-align: right; overflow-wrap: anywhere; }
.analytics-updated-at { margin: 14px 0 0; color: var(--muted); font-size: 12px; text-align: right; }
@media (max-width: 1100px) {
  .analytics-kpis { grid-template-columns: repeat(2,minmax(0,1fr)); }
  .analytics-operation-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
}
@media (max-width: 720px) {
  .analytics-head { align-items: flex-start; }
  .analytics-controls { width: 100%; grid-template-columns: 1fr auto; }
  .analytics-controls label { grid-column: 1 / -1; }
  .analytics-kpis, .analytics-grid, .analytics-operation-grid { grid-template-columns: 1fr; }
  .analytics-panel-wide { grid-column: auto; }
  .analytics-kpi { min-height: 105px; }
}
`;
