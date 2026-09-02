import { NDKEvent, zapInvoiceFromEvent } from '@nostr-dev-kit/ndk';
import { useNDK, useNDKCurrentUser, useSubscribe } from '@nostr-dev-kit/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { KIND } from '../nostr/kinds';
import { Avatar, DisplayName, Handle, NoteContent, RelativeTime, npubOf } from './primitives';
import { ZapButton } from './ZapButton';

function ActionIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function NoteCard({ event, asReplyTo }: { event: NDKEvent; asReplyTo?: boolean }) {
  const { ndk } = useNDK();
  const me = useNDKCurrentUser();
  const [reacted, setReacted] = useState(false);

  const { events: engagement } = useSubscribe(
    event.id ? [{ kinds: [KIND.Reaction, KIND.Repost, KIND.ZapReceipt], '#e': [event.id] }] : false,
    { closeOnEose: false },
    [event.id],
  );

  const stats = useMemo(() => {
    let reactions = 0;
    let reposts = 0;
    let zapCount = 0;
    let zapMsats = 0;
    for (const e of engagement) {
      if (e.kind === KIND.Reaction) reactions++;
      else if (e.kind === KIND.Repost) reposts++;
      else if (e.kind === KIND.ZapReceipt) {
        zapCount++;
        const inv = zapInvoiceFromEvent(e);
        if (inv?.amount) zapMsats += inv.amount;
      }
    }
    return { reactions, reposts, zapCount, zapSats: Math.round(zapMsats / 1000) };
  }, [engagement]);

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
    try {
      await r.publish();
    } catch {
      setReacted(false);
    }
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
    <article
      className={`flex gap-3 px-4 py-3.5 ${asReplyTo ? '' : 'border-b border-line'} transition hover:bg-surface/40`}
    >
      <Avatar pubkey={event.pubkey} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5 text-sm">
          <DisplayName pubkey={event.pubkey} />
          <Handle pubkey={event.pubkey} />
          <span className="text-ink-faint">·</span>
          <Link to={`/e/${event.encode?.() ?? event.id}`} className="hover:underline">
            <RelativeTime ts={event.created_at} />
          </Link>
        </div>

        <div className="mt-1 text-[0.95rem]">
          <NoteContent content={event.content} />
        </div>

        {!asReplyTo && (
          <div className="mt-2.5 flex items-center gap-5 text-ink-faint">
            <Link
              to={`/e/${event.encode?.() ?? event.id}`}
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition hover:bg-proto-soft hover:text-proto"
            >
              <ActionIcon path="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </Link>
            <button
              type="button"
              onClick={repost}
              disabled={!me}
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition hover:bg-good/10 hover:text-good disabled:opacity-40"
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
            >
              <ActionIcon path="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z" />
              {stats.reactions > 0 && <span className="tabular-nums">{stats.reactions}</span>}
            </button>
            <ZapButton
              pubkey={event.pubkey}
              eventId={event.id}
              totalSats={stats.zapSats}
              count={stats.zapCount}
            />
            <Link
              to={`/p/${npubOf(event.pubkey)}`}
              className="ml-auto text-xs text-ink-faint hover:text-ink-soft"
            >
              ↗
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}
