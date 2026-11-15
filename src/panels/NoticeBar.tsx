import { dismissNotice, useNotice } from '../state/notice';

/**
 * Shows the latest notice (e.g. "Saved scene.zeditor.json") as a toast at the
 * scene's top right: sunflower for news, tomato for errors, each with its own
 * icon (so color is never the only signal). Screen readers hear it; errors
 * are announced at once.
 */
export function NoticeBar() {
  const notice = useNotice();
  return (
    <div class="notice-area" role={notice?.kind === 'error' ? 'alert' : 'status'}>
      {notice && (
        <div class={`notice notice-${notice.kind}`}>
          <svg class="notice-icon" viewBox="0 0 18 18" aria-hidden="true">
            <circle cx="9" cy="9" r="7.5" />
            {notice.kind === 'error' ? (
              <path d="M9 5v5M9 12.6v.1" />
            ) : (
              <path d="M9 8v5M9 5.4v.1" />
            )}
          </svg>
          <span>{notice.text}</span>
          <button type="button" class="notice-close" aria-label="Dismiss" onClick={dismissNotice}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}
