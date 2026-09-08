import { useNDKCurrentUser } from '@nostr-dev-kit/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Addr } from '../nostr/bootcamps';
import { neventOf, useHighlightActions } from '../nostr/highlights';

interface Grab {
  text: string;
  context: string;
  rect: { top: number; left: number };
}

const MAX_CONTEXT = 600;

/** Nearest block-level ancestor, for grabbing the surrounding sentence(s). */
function blockText(node: Node | null, root: HTMLElement): string {
  let el = node instanceof HTMLElement ? node : node?.parentElement ?? null;
  while (el && el !== root) {
    const display = getComputedStyle(el).display;
    if (display === 'block' || display === 'list-item') break;
    el = el.parentElement;
  }
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_CONTEXT);
}

/**
 * Select any text inside `containerRef` → a "Highlight" button floats above it.
 * Clicking opens a sheet to add commentary; posting publishes a NIP-84
 * highlight (and, if a note was written, a kind:1 that quotes it into the feed).
 */
export function HighlightPopover({
  containerRef,
  source,
  sourceAuthor,
}: {
  containerRef: React.RefObject<HTMLElement | null>;
  source: Addr;
  sourceAuthor?: string;
}) {
  const me = useNDKCurrentUser();
  const { highlight } = useHighlightActions();

  const grabRef = useRef<Grab | null>(null); // latest valid selection
  const [barAt, setBarAt] = useState<{ top: number; left: number } | null>(null);
  const [sheet, setSheet] = useState<Grab | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ nevent: string; noted: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const clearBar = useCallback(() => {
    grabRef.current = null;
    setBarAt(null);
  }, []);

  const readSelection = useCallback(() => {
    const root = containerRef.current;
    const sel = window.getSelection();
    if (!root || !sel || sel.isCollapsed || sel.rangeCount === 0) return clearBar();

    const text = sel.toString().replace(/\s+/g, ' ').trim();
    if (text.length < 2) return clearBar();

    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return clearBar();

    const r = range.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return clearBar();

    grabRef.current = {
      text,
      context: blockText(range.commonAncestorContainer, root),
      rect: { top: r.top, left: r.left + r.width / 2 },
    };
    setBarAt({ top: r.top, left: r.left + r.width / 2 });
  }, [containerRef, clearBar]);

  useEffect(() => {
    if (!me) return;
    const onUp = () => setTimeout(readSelection, 0);
    const onScroll = () => clearBar();
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchend', onUp);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchend', onUp);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [me, readSelection, clearBar]);

  function openSheet() {
    const g = grabRef.current;
    if (!g) return;
    setSheet(g);
    setNote('');
    setDone(null);
    setErr(null);
    clearBar();
    window.getSelection()?.removeAllRanges();
  }

  async function post() {
    if (!sheet || busy || !me) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await highlight({
        text: sheet.text,
        source,
        sourceAuthor,
        context: sheet.context,
        note,
      });
      setDone({
        nevent: neventOf({
          id: res.eventId,
          pubkey: res.pubkey,
          kind: res.noted ? 1 : undefined,
        }),
        noted: res.noted,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not publish');
    } finally {
      setBusy(false);
    }
  }

  if (!me) return null;

  return (
    <>
      {barAt && (
        <div
          className="fixed z-30 -translate-x-1/2 -translate-y-full pb-2"
          style={{ top: barAt.top, left: barAt.left }}
        >
          <button
            type="button"
            // mousedown, not click: fire before the browser clears the selection
            onMouseDown={(e) => {
              e.preventDefault();
              openSheet();
            }}
            className="flex items-center gap-1.5 rounded-full bg-slab px-3 py-1.5 text-xs font-semibold text-white shadow-lg transition hover:opacity-90"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M9 11l3 3 8-8M5 19h14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Highlight
          </button>
        </div>
      )}

      {sheet && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-slab/30 p-0 sm:items-center sm:p-4"
          onMouseDown={() => !busy && setSheet(null)}
        >
          <div
            className="w-full max-w-lg rounded-t-2xl border border-line bg-bg p-4 shadow-xl sm:rounded-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {done ? (
              <div className="py-2 text-center">
                <p className="font-display text-sm font-semibold">
                  {done.noted ? 'Posted to the feed' : 'Highlighted'}
                </p>
                <div className="mt-3 flex justify-center gap-2">
                  <Link
                    to={`/e/${done.nevent}`}
                    className="rounded-full bg-slab px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                  >
                    View
                  </Link>
                  <button
                    type="button"
                    onClick={() => setSheet(null)}
                    className="rounded-full border border-line-strong px-4 py-1.5 text-xs font-semibold text-ink-soft hover:text-ink"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="mb-2 font-mono text-[11px] uppercase tracking-wide text-ink-faint">
                  Highlight
                </p>
                <blockquote className="max-h-40 overflow-y-auto border-l-2 border-zap pl-3 text-sm text-ink-soft">
                  {sheet.text}
                </blockquote>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Add your take — this posts it to the feed (optional)"
                  className="mt-3 w-full resize-none rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none focus:border-zap placeholder:text-ink-faint"
                />
                {err && <p className="mt-1 text-xs text-danger">{err}</p>}
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSheet(null)}
                    disabled={busy}
                    className="rounded-full px-3 py-1.5 text-xs font-semibold text-ink-faint hover:text-ink disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={post}
                    disabled={busy}
                    className="rounded-full bg-zap px-4 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
                  >
                    {busy ? '…' : note.trim() ? 'Post highlight' : 'Save highlight'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
