export const CAMPAIGN_UI_CSS = String.raw`
.campaign-lock-notice, .campaign-lock-inline {
  border-radius: 12px; background: #fff1c2; color: #6b4600; line-height: 1.45;
}
.campaign-lock-notice { margin-bottom: 16px; padding: 12px 14px; }
.campaign-lock-inline { margin: 14px 0; padding: 10px 12px; font-size: 13px; font-weight: 750; }
.campaign-layout { display: grid; grid-template-columns: minmax(270px, 360px) minmax(0, 1fr); gap: 16px; min-height: 620px; }
.campaign-sidebar, .campaign-workspace, .campaign-form, .campaign-detail {
  min-width: 0; border: 1px solid var(--border); border-radius: 16px; background: #fff;
}
.campaign-sidebar { overflow: hidden; }
.campaign-list { max-height: 760px; overflow: auto; }
.campaign-item { width: 100%; display: grid; gap: 5px; border: 0; border-bottom: 1px solid #eef1f6; padding: 14px 15px; background: #fff; text-align: left; }
.campaign-item:hover, .campaign-item.active { background: #f1edff; }
.campaign-item strong { overflow-wrap: anywhere; }
.campaign-item > span { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
.campaign-item > div { display: flex; justify-content: space-between; gap: 8px; color: var(--muted); font-size: 12px; }
.campaign-item em { color: var(--brand-dark); font-style: normal; font-weight: 800; }
.campaign-workspace { padding: 18px; background: #fafbff; }
.campaign-form, .campaign-detail { padding: 18px; }
.campaign-form-head, .campaign-detail-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 16px; }
.campaign-form-head h2, .campaign-detail-head h2 { margin: 0 0 5px; }
.campaign-form-head p, .campaign-detail-head p { margin: 0; color: var(--muted); }
.campaign-fieldset { margin: 16px 0 0; padding: 13px; border: 1px solid var(--border); border-radius: 12px; }
.campaign-fieldset legend { padding: 0 7px; color: var(--muted); font-size: 13px; font-weight: 800; }
.campaign-check-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.campaign-check { display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--border); border-radius: 999px; padding: 7px 10px; background: #fff; font-size: 13px; cursor: pointer; }
.campaign-check input { width: auto; margin: 0; accent-color: var(--brand); }
.campaign-variables { margin-top: 16px; padding: 14px; border: 1px solid var(--border); border-radius: 12px; background: #f8f7ff; }
.campaign-variables h3 { margin: 0 0 5px; font-size: 15px; }
.campaign-variables p { margin: 0 0 12px; color: var(--muted); font-size: 12px; }
.campaign-form-actions, .campaign-detail-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 9px; margin-top: 18px; }
.danger-button { border: 1px solid #f3b5b0; border-radius: 10px; padding: 9px 12px; background: #fff; color: #b42318; font-weight: 800; }
.campaign-status { display: inline-flex; border-radius: 999px; padding: 6px 10px; font-size: 12px; font-weight: 850; white-space: nowrap; }
.campaign-status-draft { background: #eee9ff; color: #4b2ea8; }
.campaign-status-previewed { background: #dcfae6; color: #166534; }
.campaign-status-approved { background: #dbeafe; color: #1e40af; }
.campaign-status-running { background: #fff7df; color: #7a4b00; }
.campaign-status-completed { background: #dcfae6; color: #166534; }
.campaign-status-completed_with_errors { background: #fee4e2; color: #912018; }
.campaign-status-cancelled { background: #e4e7ec; color: #475467; }
.campaign-filter-description { padding: 12px; border: 1px solid var(--border); border-radius: 11px; background: #fff; color: #475467; line-height: 1.45; }
.campaign-empty-preview { margin-top: 18px; padding: 30px; border: 1px dashed var(--border); border-radius: 12px; color: var(--muted); text-align: center; }
.campaign-metrics { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 10px; margin-top: 18px; }
.campaign-metrics > div { display: grid; gap: 4px; padding: 14px; border: 1px solid var(--border); border-radius: 12px; background: #fff; text-align: center; }
.campaign-metrics strong { font-size: 26px; }
.campaign-metrics span { color: var(--muted); font-size: 12px; }
.campaign-exclusions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.campaign-exclusions span { border-radius: 999px; padding: 6px 9px; background: #fee4e2; color: #912018; font-size: 12px; }
.campaign-recipient-sections { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 18px; }
.campaign-recipient-sections > section { min-width: 0; border: 1px solid var(--border); border-radius: 12px; background: #fff; overflow: hidden; }
.campaign-recipient-sections h3 { margin: 0; padding: 12px 13px; border-bottom: 1px solid var(--border); font-size: 15px; }
.campaign-recipient-table { max-height: 360px; overflow: auto; }
.campaign-recipient-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 11px 12px; border-bottom: 1px solid #eef1f6; }
.campaign-recipient-row:last-child { border-bottom: 0; }
.campaign-recipient-row > div { min-width: 0; display: grid; gap: 3px; }
.campaign-recipient-row strong, .campaign-recipient-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.campaign-recipient-row span { color: var(--muted); font-size: 12px; }
.campaign-recipient-row em { max-width: 145px; color: var(--muted); font-size: 11px; font-style: normal; text-align: right; }
@media (max-width: 1000px) {
  .campaign-layout { grid-template-columns: 1fr; min-height: 0; }
  .campaign-list { max-height: 330px; }
}
@media (max-width: 700px) {
  .campaign-workspace { padding: 8px; }
  .campaign-form, .campaign-detail { padding: 13px; }
  .campaign-metrics, .campaign-recipient-sections { grid-template-columns: 1fr; }
  .campaign-detail-head, .campaign-form-head { align-items: flex-start; }
}
`;
