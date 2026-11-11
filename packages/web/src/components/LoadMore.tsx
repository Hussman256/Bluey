import { useEffect, useRef } from 'react';

/** Loads the next page as it scrolls into view, with a button for when that doesn't fire. */
export function LoadMore({
  notes,
  loading,
  done,
  error,
  load,
}: {
  notes: unknown[];
  loading: boolean;
  done: boolean;
  error: boolean;
  load: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const count = notes.length;

  // rebuilt after every page: an observer only fires on change, and if a page was
  // all filtered out the marker is still on screen and needs another look
  useEffect(() => {
    const el = ref.current;
    if (!el || loading || done || error) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) load();
      },
      { rootMargin: '600px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [count, loading, done, error, load]);

  return (
    <div ref={ref} className="px-4 py-6 text-center">
      {done ? (
        <p className="font-mono text-xs text-ink-faint">That's everything for now.</p>
      ) : loading ? (
        <p className="font-mono text-xs text-ink-faint">loading older posts…</p>
      ) : (
        <button
          type="button"
          onClick={load}
          className="min-h-11 rounded-xl border border-line-strong bg-surface px-4 text-sm font-semibold"
        >
          {error ? "Couldn't load. Try again" : 'Load older posts'}
        </button>
      )}
    </div>
  );
}
