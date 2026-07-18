export const TEMPLATE_UI_CSS = String.raw`
.template-notice, .template-charge-notice, .template-blocked {
  border-radius: 12px; padding: 11px 13px; line-height: 1.45;
}
.template-notice { margin-bottom: 16px; background: #eef4ff; color: #344054; }
.template-charge-notice { margin-top: 14px; background: #fff7e8; color: #7a4b00; font-size: 13px; }
.template-blocked { margin-top: 14px; background: #fee4e2; color: #912018; font-weight: 750; }
.template-filters { grid-template-columns: minmax(260px,1fr) 240px; }
.template-summary { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.template-summary-item, .template-status { display: inline-flex; border-radius: 999px; padding: 5px 9px; font-size: 12px; font-weight: 800; }
.status-approved { background: #dcfae6; color: #166534; }
.status-pending { background: #fff1c2; color: #7a4b00; }
.status-rejected, .status-disabled, .status-not_found { background: #fee4e2; color: #912018; }
.status-paused { background: #e4e7ec; color: #344054; }
.status-local_draft { background: #eee9ff; color: #4b2ea8; }
.template-list { display: grid; grid-template-columns: repeat(auto-fill,minmax(320px,1fr)); gap: 14px; }
.template-card { min-width: 0; padding: 16px; border: 1px solid var(--border); border-radius: 16px; background: #fff; }
.template-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.template-card-head h3 { margin: 0 0 5px; font-size: 17px; overflow-wrap: anywhere; }
.template-meta, .template-sync-time { color: var(--muted); font-size: 12px; }
.template-sync-time { margin-top: 12px; }
.template-rejection { margin-top: 10px; padding: 9px 10px; border-radius: 9px; background: #fee4e2; color: #912018; font-size: 13px; }
.template-preview, .template-live-preview { margin-top: 14px; overflow: hidden; border: 1px solid #d8dee9; border-radius: 12px; background: #f7f9fc; }
.template-preview-header { padding: 11px 12px 3px; font-weight: 850; overflow-wrap: anywhere; }
.template-preview-body { padding: 11px 12px; line-height: 1.48; overflow-wrap: anywhere; }
.template-preview-footer { padding: 0 12px 10px; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
.template-media-header { min-height: 90px; display: grid; place-items: center; padding: 12px; background: #e9edf5; color: var(--muted); font-weight: 800; text-align: center; }
.template-buttons { display: grid; border-top: 1px solid #d8dee9; }
.template-buttons span { padding: 9px 12px; color: var(--brand); text-align: center; font-weight: 800; border-bottom: 1px solid #e7eaf0; }
.template-buttons span:last-child { border-bottom: 0; }
.template-open-button { min-height: 46px; align-self: end; font-weight: 800; }
.composer.media-enabled.template-enabled { grid-template-columns: auto auto minmax(0,1fr) auto; }
.composer.template-enabled:not(.media-enabled) { grid-template-columns: auto minmax(0,1fr) auto; }
.template-modal { position: fixed; inset: 0; z-index: 55; display: grid; place-items: center; padding: 20px; background: rgba(16,24,40,.6); }
.template-dialog { width: min(980px,100%); max-height: calc(100vh - 40px); overflow: auto; border-radius: 18px; padding: 20px; background: #fff; box-shadow: 0 26px 80px rgba(16,24,40,.3); }
.template-dialog-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
.template-dialog-head h2 { margin: 0 0 5px; font-size: 22px; }
.template-dialog-head p { margin: 0; color: var(--muted); }
.template-dialog-grid { display: grid; grid-template-columns: minmax(260px,340px) minmax(0,1fr); gap: 16px; margin-top: 18px; min-height: 430px; }
.template-picker, .template-picker-detail { min-width: 0; border: 1px solid var(--border); border-radius: 14px; background: #fff; }
.template-picker { display: flex; flex-direction: column; overflow: hidden; }
.template-picker-search { margin: 12px; width: calc(100% - 24px); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
.template-picker-list { flex: 1; max-height: 520px; overflow: auto; border-top: 1px solid var(--border); }
.template-picker-item { width: 100%; display: grid; gap: 4px; border: 0; border-bottom: 1px solid #eef1f6; padding: 13px 14px; background: #fff; text-align: left; }
.template-picker-item:hover, .template-picker-item.active { background: #f1edff; }
.template-picker-item strong { overflow-wrap: anywhere; }
.template-picker-item > span { color: var(--muted); font-size: 12px; }
.template-picker-item .template-media-mark { width: max-content; color: #912018; font-weight: 800; }
.template-picker-detail { padding: 16px; max-height: 560px; overflow: auto; background: #fafbff; }
.template-selected-head { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
.template-selected-head h3 { margin: 0; overflow-wrap: anywhere; }
.template-selected-head span { color: var(--muted); font-size: 12px; }
.template-variable-fields { margin-top: 16px; display: grid; gap: 10px; }
.template-variable-fields h3 { margin: 0; font-size: 15px; }
.template-variable-fields label { display: grid; gap: 6px; color: var(--muted); font-size: 12px; font-weight: 800; }
.template-variable-fields input { width: 100%; border: 1px solid var(--border); border-radius: 9px; padding: 10px 11px; }
.template-no-variables { margin-top: 14px; padding: 10px; border-radius: 10px; background: #eef4ff; color: #344054; }
.template-live-preview mark { border-radius: 4px; padding: 1px 3px; background: #fff1c2; color: inherit; }
@media (max-width: 760px) {
  .composer.media-enabled.template-enabled { grid-template-columns: auto auto minmax(0,1fr) auto; }
  .template-open-button { width: 46px; overflow: hidden; padding: 8px; font-size: 0; }
  .template-open-button::before { content: 'T'; font-size: 18px; font-weight: 900; }
  .template-modal { padding: 8px; align-items: end; }
  .template-dialog { max-height: 92vh; border-radius: 18px 18px 0 0; padding: 14px; }
  .template-dialog-grid { grid-template-columns: 1fr; min-height: 0; }
  .template-picker-list { max-height: 230px; }
  .template-picker-detail { max-height: none; }
  .template-list { grid-template-columns: 1fr; }
  .template-filters { grid-template-columns: 1fr; }
}
`;
