export const MEDIA_COMPOSER_CSS = String.raw`
.composer.media-enabled { grid-template-columns: auto minmax(0, 1fr) auto; }
.attach-button { min-height: 46px; align-self: end; font-weight: 800; }
.media-modal { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 20px; background: rgba(16, 24, 40, .58); }
.media-dialog { width: min(520px, 100%); max-height: calc(100vh - 40px); overflow: auto; background: white; border-radius: 18px; padding: 20px; box-shadow: 0 24px 70px rgba(16,24,40,.28); }
.media-dialog-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
.media-dialog-head h2 { margin: 0 0 5px; font-size: 21px; }
.media-dialog-head p { margin: 0; color: var(--muted); overflow-wrap: anywhere; }
.media-close { border: 0; background: transparent; color: var(--muted); font-size: 30px; line-height: 1; padding: 0 4px; }
.media-preview { min-height: 150px; margin: 18px 0; border: 1px solid var(--border); border-radius: 14px; background: #f6f7fb; display: grid; place-items: center; overflow: hidden; }
.media-preview img, .media-preview video { display: block; width: 100%; max-height: 330px; object-fit: contain; background: #111827; }
.media-file-icon { width: 112px; height: 112px; border-radius: 22px; display: grid; place-items: center; padding: 12px; text-align: center; background: #eee9ff; color: var(--brand-dark); font-weight: 900; }
.media-caption-field { display: grid; gap: 8px; color: var(--muted); font-size: 13px; font-weight: 800; }
.media-caption-field textarea { width: 100%; resize: vertical; border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; color: var(--text); outline: none; }
.media-caption-field textarea:focus { border-color: var(--brand); box-shadow: 0 0 0 3px rgba(91,54,201,.12); }
.media-progress { margin-top: 14px; border-radius: 10px; padding: 11px 12px; background: #f1edff; color: var(--brand-dark); font-weight: 800; }
.media-dialog-actions { margin-top: 18px; display: flex; justify-content: flex-end; gap: 10px; }
@media (max-width: 760px) {
  .composer.media-enabled { grid-template-columns: auto minmax(0, 1fr) auto; }
  .attach-button { width: 46px; overflow: hidden; padding: 8px; font-size: 0; }
  .attach-button::before { content: '＋'; font-size: 24px; }
  .media-modal { padding: 10px; align-items: end; }
  .media-dialog { max-height: 88vh; border-radius: 18px 18px 0 0; }
}
`;
