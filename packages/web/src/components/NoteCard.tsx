import { NDKEvent } from '@nostr-dev-kit/ndk';
import { useEvent, useNDK, useNDKCurrentUser } from '@nostr-dev-kit/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { parseAddr } from '../nostr/bootcamps';
import { NoteContent } from '../nostr/content';
import { useNoteStats } from '../nostr/engagement';
import { KIND } from '../nostr/kinds';
import { SourceTitle } from '../nostr/sourceTitle';
import { Avatar, DisplayName, Handle, RelativeTime } from './primitives';
import { ZapButton } from './ZapButton';

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
        <blockquote className="mt-2 border-l-2 border-zap pl-3 text-[0.95rem] leading-relaxed text-ink-soft">
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
        </div>

        <div className="mt-1">
          <NoteContent content={event.content} />
        </div>

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
        </div>
      </div>
    </article>
  );
}
