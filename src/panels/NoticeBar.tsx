import { dismissNotice, useNotice } from '../state/notice';

/**
 * Shows the latest notice (e.g. "Saved scene.zeditor.json") at the bottom of
 * the viewport. Screen readers hear it; errors are announced at once.
 */
export function NoticeBar() {
  const notice = useNotice();
  return (
    <div class="notice-area" role={notice?.kind === 'error' ? 'alert' : 'status'}>
      {notice && (
        <div class={`notice notice-${notice.kind}`}>
          <span>{notice.text}</span>
          <button type="button" class="notice-close" aria-label="Dismiss" onClick={dismissNotice}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}
