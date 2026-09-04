import { useRegisterSW } from 'virtual:pwa-register/react';

/** Small toast when a new build is available or the app is ready offline. */
export function PwaPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh && !offlineReady) return null;

  return (
    <div className="fixed inset-x-3 bottom-20 z-50 mx-auto max-w-sm rounded-xl border border-line-strong bg-surface px-4 py-3 shadow-xl sm:bottom-4">
      {needRefresh ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span>A new version of 1btc is ready.</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => updateServiceWorker(true)}
              className="rounded-full bg-zap px-3 py-1 text-xs font-semibold text-bg"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={() => setNeedRefresh(false)}
              className="text-xs text-ink-faint"
            >
              Later
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-ink-soft">1btc is ready to work offline.</span>
          <button
            type="button"
            onClick={() => setOfflineReady(false)}
            className="text-xs text-ink-faint"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
