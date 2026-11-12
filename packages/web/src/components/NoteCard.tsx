import { NDKEvent } from '@nostr-dev-kit/ndk';
import { useEvent, useNDK, useNDKCurrentUser } from '@nostr-dev-kit/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { parseAddr } from '../nostr/bootcamps';
import { NoteContent } from '../nostr/content';
import { deleteEvent, useIsDeleted } from '../nostr/deletions';
import { useNoteStats } from '../nostr/engagement';
import { KIND } from '../nostr/kinds';
import { useMuteActions } from '../nostr/mutes';
import { isShip } from '../nostr/ships';
import { SourceTitle } from '../nostr/sourceTitle';
import {
  isAutoTranslateEnabled,
  languageGuess,
  setAutoTranslateEnabled,
  translateText,
} from '../nostr/translate';
import { Avatar, DisplayName, Handle, RelativeTime } from './primitives';
import { ShipBadge, ShipBody } from './ShipBody';
import { ZapButton } from './ZapButton';

/** Per-note overflow: mute the author, file a report, or toggle auto-translate. */
function NoteMenu({ event }: { event: NDKEvent }) {
  const { ndk } = useNDK();
  const me = useNDKCurrentUser();
  const { mutePubkey } = useMuteActions();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [autoTranslate, setAutoTranslate] = useState(isAutoTranslateEnabled);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!ndk || deleting) return;
    setDeleting(true);
    try {
      await deleteEvent(ndk, event); // the card disappears on success
    } catch {
      setDone("Couldn't delete. Try again.");
      setDeleting(false);
    }
  }

  useEffect(() => {
    const onAutoChange = () => setAutoTranslate(isAutoTranslateEnabled());
    window.addEventListener('bluey:auto-translate-changed', onAutoChange);
    return () => window.removeEventListener('bluey:auto-translate-changed', onAutoChange);
  }, []);

  async function report() {
    if (!ndk) return;
    const r = new NDKEvent(ndk);
    r.kind = KIND.Report;
    r.content = '';
    r.tags = [
      ['e', event.id, 'spam'],
      ['p', event.pubkey, 'spam'],
    ];
    await r.publish().catch(() => undefined);
    setDone('Reported');
  }

  return (
    <div className="relative ml-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full px-2 py-1 text-xs transition hover:bg-surface hover:text-ink"
        aria-label="More"
      >
        <ActionIcon path="M12 5h.01M12 12h.01M12 19h.01" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-8 z-20 w-56 overflow-hidden rounded-xl border border-line bg-bg py-1 text-xs shadow-lg"
          onMouseLeave={() => {
            setOpen(false);
            setConfirmDelete(false);
          }}
        >
          {done ? (
            <span className="block px-3 py-2 text-xs text-ink-faint">{done}</span>
          ) : confirmDelete ? (
            <div className="flex flex-col gap-2 px-3 py-2.5">
              <p className="leading-relaxed text-ink-soft">
                Delete this post? Relays and other apps are asked to remove it, but some may keep a copy.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void remove()}
                  disabled={deleting}
                  className="min-h-9 flex-1 rounded-lg bg-danger font-semibold text-white disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="min-h-9 flex-1 rounded-lg border border-line-strong font-semibold"
                >
                  Keep
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setAutoTranslateEnabled(!autoTranslate);
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left hover:bg-surface text-ink font-medium"
              >
                {autoTranslate ? 'Disable auto-translate' : 'Enable auto-translate'}
              </button>
              {me && me.pubkey === event.pubkey && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="block w-full px-3 py-2 text-left text-danger hover:bg-danger/10"
                >
                  Delete this post
                </button>
              )}
              {me && me.pubkey !== event.pubkey && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      void mutePubkey(event.pubkey);
                      setOpen(false);
                    }}
                    className="block w-full px-3 py-2 text-left hover:bg-surface"
                  >
                    Mute this account
                  </button>
                  <button
                    type="button"
                    onClick={() => void report()}
                    className="block w-full px-3 py-2 text-left text-danger hover:bg-danger/10"
                  >
                    Report as spam
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function NoteBody({
  content,
  sensitive,
  sensitiveReason,
}: {
  content: string;
  sensitive?: boolean;
  sensitiveReason?: string;
}) {
  const [translated, setTranslated] = useState<string | null>(null);
  const [sourceLang, setSourceLang] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoEnabled, setAutoEnabled] = useState(isAutoTranslateEnabled);

  useEffect(() => {
    const onAutoChange = () => setAutoEnabled(isAutoTranslateEnabled());
    window.addEventListener('bluey:auto-translate-changed', onAutoChange);
    return () => window.removeEventListener('bluey:auto-translate-changed', onAutoChange);
  }, []);

  const cleanText = content.replace(/https?:\/\/\S+/g, '').replace(/nostr:\S+/g, '').trim();
  const [guess, setGuess] = useState<{ text: string; lang: 'same' | 'foreign' | 'unknown' } | null>(null);
  const lang = guess?.text === cleanText ? guess.lang : null;
  // posts the browser can tell are already in your language get no button
  const canTranslate = cleanText.length > 6 && lang !== 'same';

  useEffect(() => {
    if (cleanText.length <= 6) return;
    let cancelled = false;
    void languageGuess(cleanText).then((g) => !cancelled && setGuess({ text: cleanText, lang: g }));
    return () => {
      cancelled = true;
    };
  }, [cleanText]);

  const handleTranslate = useCallback(async () => {
    if (loading || translated) return;
    setLoading(true);
    setError(null);
    try {
      const res = await translateText(content);
      if (res.text.trim().toLowerCase() === content.trim().toLowerCase()) {
        setError('Same language');
      } else {
        setTranslated(res.text);
        if (res.sourceLang) setSourceLang(res.sourceLang);
      }
    } catch {
      setError('Translation unavailable');
    } finally {
      setLoading(false);
    }
  }, [content, loading, translated]);

  useEffect(() => {
    let cancelled = false;
    if (autoEnabled && lang === 'foreign' && !translated) {
      Promise.resolve().then(async () => {
        if (cancelled) return;
        setLoading(true);
        try {
          const res = await translateText(content);
          if (cancelled) return;
          // not worth an error on a feed: the post simply stays as written
          if (res.text.trim().toLowerCase() !== content.trim().toLowerCase()) {
            setTranslated(res.text);
            if (res.sourceLang) setSourceLang(res.sourceLang);
          }
        } catch {
          // stay quiet on a feed: the post stays as written and the button still works
        } finally {
          if (!cancelled) setLoading(false);
        }
      });
    }
    return () => {
      cancelled = true;
    };
  }, [autoEnabled, lang, translated, content]);

  const activeContent = translated && !showOriginal ? translated : content;

  return (
    <div className="mt-1">
      <NoteContent
        content={activeContent}
        sensitive={sensitive}
        sensitiveReason={sensitiveReason}
      />
      {canTranslate && (
        <div className="mt-1 flex items-center gap-2 text-[12px] text-ink-faint">
          {translated ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-ink-faint">
                Translated {sourceLang ? `from ${sourceLang.toUpperCase()}` : ''}
              </span>
              <span>·</span>
              <button
                type="button"
                onClick={() => setShowOriginal((v) => !v)}
                className="hover:underline hover:text-ink cursor-pointer"
              >
                {showOriginal ? 'Show translation' : 'Show original'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void handleTranslate()}
              disabled={loading}
              className="inline-flex items-center gap-1 hover:text-ink hover:underline cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <span className="text-[11px]">Translating…</span>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6" />
                  </svg>
                  <span className="text-[11px]">Translate post</span>
                </>
              )}
            </button>
          )}
          {error && <span className="text-danger text-[11px]">{error}</span>}
        </div>
      )}
    </div>
  );
}

function ActionIcon({ path, filled = false }: { path: string; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A repost (kind 6) wraps another note — unwrap and render that. */
export function NoteCard({ event }: { event: NDKEvent }) {
  const deleted = useIsDeleted(event.id);
  if (deleted) return null;
  if (event.kind === KIND.Repost || event.kind === KIND.GenericRepost) {
    return <RepostCard event={event} />;
  }
  if (event.kind === KIND.Highlight) {
    return <HighlightCard event={event} />;
  }
  return <PlainNote event={event} />;
}

/** A bare NIP-84 highlight (no commentary) surfaced on its own. */
function HighlightCard({ event }: { event: NDKEvent }) {
  const src = event.tags.find((t) => t[0] === 'a')?.[1];
  const link = `/e/${event.encode()}`;
  return (
    <article className="flex gap-3 border-b border-line px-4 py-3.5">
      <Avatar pubkey={event.pubkey} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5 text-sm">
          <DisplayName pubkey={event.pubkey} />
          <span className="text-ink-faint">highlighted</span>
          <span className="text-ink-faint">·</span>
          <Link to={link} className="shrink-0 hover:underline">
            <RelativeTime ts={event.created_at} />
          </Link>
        </div>
        <blockquote className="mt-2 border-l-2 border-brand pl-3 text-[0.95rem] leading-relaxed text-ink-soft">
          {event.content}
        </blockquote>
        <p className="mt-2 text-xs text-ink-faint">
          from <SourceTitle source={src ? parseAddr(src) : null} />
        </p>
      </div>
    </article>
  );
}

function RepostCard({ event }: { event: NDKEvent }) {
  const { ndk } = useNDK();
  const me = useNDKCurrentUser();
  const taggedId = event.tags.find((t) => t[0] === 'e')?.[1];

  const inner = useMemo(() => {
    if (!ndk) return null;
    try {
      const raw = JSON.parse(event.content);
      if (raw && raw.id && raw.sig) return new NDKEvent(ndk, raw);
    } catch {
      /* content wasn't the embedded event */
    }
    return null;
  }, [ndk, event.content]);

  const fetched = useEvent(!inner && taggedId ? { ids: [taggedId] } : false, undefined, [taggedId]);
  const note = inner ?? fetched;

  return (
    <div className="border-b border-line">
      <div className="flex items-center gap-2 px-4 pt-2.5 text-xs text-ink-faint">
        <ActionIcon path="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" />
        <DisplayName pubkey={event.pubkey} className="text-xs" /> reposted
        {me?.pubkey === event.pubkey && ndk && (
          <button
            type="button"
            onClick={() => void deleteEvent(ndk, event).catch(() => undefined)}
            className="ml-auto font-semibold hover:text-ink hover:underline"
          >
            Undo
          </button>
        )}
      </div>
      {note ? (
        <PlainNote event={note} bare />
      ) : (
        <p className="px-4 py-4 font-mono text-xs text-ink-faint">reposted note unavailable</p>
      )}
    </div>
  );
}

function PlainNote({ event, bare = false }: { event: NDKEvent; bare?: boolean }) {
  const { ndk } = useNDK();
  const me = useNDKCurrentUser();
  const stats = useNoteStats(event.id);
  const [reacted, setReacted] = useState(false);
  const link = `/e/${event.encode()}`;
  const ship = isShip(event);

  async function react() {
    if (!ndk || !me || reacted) return;
    setReacted(true);
    const r = new NDKEvent(ndk);
    r.kind = KIND.Reaction;
    r.content = '+';
    r.tags = [
      ['e', event.id],
      ['p', event.pubkey],
    ];
    await r.publish().catch(() => setReacted(false));
  }

  async function repost() {
    if (!ndk || !me) return;
    const r = new NDKEvent(ndk);
    r.kind = KIND.Repost;
    r.content = JSON.stringify(event.rawEvent());
    r.tags = [
      ['e', event.id],
      ['p', event.pubkey],
    ];
    await r.publish().catch(() => undefined);
  }

  return (
    <article className={`flex gap-3 px-4 py-3.5 ${bare ? '' : 'border-b border-line'}`}>
      <Avatar pubkey={event.pubkey} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5 text-sm">
          <DisplayName pubkey={event.pubkey} />
          <Handle pubkey={event.pubkey} />
          <span className="text-ink-faint">·</span>
          <Link to={link} className="shrink-0 hover:underline">
            <RelativeTime ts={event.created_at} />
          </Link>
          {ship && <ShipBadge />}
        </div>

        {ship ? (
          <ShipBody event={event} />
        ) : (
          <NoteBody
            content={event.content}
            sensitive={event.tags.some((t) => t[0] === 'content-warning')}
            sensitiveReason={event.tags.find((t) => t[0] === 'content-warning')?.[1]}
          />
        )}

        <div className="mt-2.5 flex items-center gap-1 text-ink-faint">
          <Link
            to={link}
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition hover:bg-surface hover:text-ink"
            aria-label="Replies"
          >
            <ActionIcon path="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            {stats.replies > 0 && <span className="tabular-nums">{stats.replies}</span>}
          </Link>
          <button
            type="button"
            onClick={repost}
            disabled={!me}
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition hover:bg-good/10 hover:text-good disabled:opacity-40"
            aria-label="Repost"
          >
            <ActionIcon path="M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3" />
            {stats.reposts > 0 && <span className="tabular-nums">{stats.reposts}</span>}
          </button>
          <button
            type="button"
            onClick={react}
            disabled={!me}
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition hover:bg-danger/10 hover:text-danger disabled:opacity-40 ${
              reacted ? 'text-danger' : ''
            }`}
            aria-label="React"
          >
            <ActionIcon
              filled={reacted}
              path="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"
            />
            {stats.reactions > 0 && <span className="tabular-nums">{stats.reactions}</span>}
          </button>
          <ZapButton
            pubkey={event.pubkey}
            eventId={event.id}
            totalSats={stats.zapSats}
            count={stats.zapCount}
          />
          <NoteMenu event={event} />
        </div>
      </div>
    </article>
  );
}
