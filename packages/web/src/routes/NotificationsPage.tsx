import type { NotificationItem } from '@1btc/shared';
import { useNDKCurrentUser } from '@nostr-dev-kit/react';
import { Link } from 'react-router-dom';
import { Avatar, DisplayName, RelativeTime } from '../components/primitives';
import { eventIdFrom } from '../nostr/ids';
import { KIND } from '../nostr/kinds';
import { useIndexNotifications, useIndexStatus } from '../nostr/useIndex';

function verb(n: NotificationItem): { text: string; color: string } {
  switch (n.kind) {
    case KIND.ZapReceipt:
      return { text: `zapped you ${n.zapSats?.toLocaleString() ?? ''} sats`, color: 'text-zap' };
    case KIND.Reaction:
      return { text: 'reacted to your note', color: 'text-danger' };
    case KIND.Repost:
    case KIND.GenericRepost:
      return { text: 'reposted your note', color: 'text-good' };
    default:
      return { text: n.contentPreview ? 'mentioned you' : 'replied to your note', color: 'text-proto' };
  }
}

function Icon({ kind }: { kind: number }) {
  const p =
    kind === KIND.ZapReceipt
      ? 'M13 2 3 14h7l-1 8 10-12h-7l1-8Z'
      : kind === KIND.Reaction
        ? 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z'
        : kind === KIND.Repost || kind === KIND.GenericRepost
          ? 'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3'
          : 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z';
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d={p} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function NotificationsPage() {
  const me = useNDKCurrentUser();
  const indexUp = useIndexStatus();
  const { data, loading, fromIndex } = useIndexNotifications({ pubkey: me?.pubkey ?? '' });

  return (
    <div>
      <header className="sticky top-0 z-10 border-b border-line bg-bg/90 px-4 py-3.5 font-display text-lg font-bold backdrop-blur">
        Notifications
      </header>

      {!indexUp && (
        <p className="px-4 py-10 text-center text-sm text-ink-soft">
          Notifications need the 1btc index service. Start it with{' '}
          <code className="rounded bg-sunk px-1.5 py-0.5 font-mono text-xs">npm run dev:server</code>.
        </p>
      )}

      {indexUp && loading && (
        <p className="px-4 py-10 text-center font-mono text-xs text-ink-faint">loading…</p>
      )}

      {indexUp && fromIndex && data && data.length === 0 && (
        <p className="px-4 py-10 text-center text-sm text-ink-soft">
          Nothing yet. Post something and see who zaps it.
        </p>
      )}

      <ul>
        {(data ?? []).map((n) => {
          const v = verb(n);
          const to = n.targetId
            ? `/e/${n.targetId}`
            : eventIdFrom(n.id)
              ? `/e/${n.id}`
              : '#';
          return (
            <li key={`${n.id}:${n.pubkey}`}>
              <Link
                to={to}
                className="flex items-start gap-3 border-b border-line px-4 py-3.5 transition hover:bg-surface/40"
              >
                <span className={`mt-0.5 ${v.color}`}>
                  <Icon kind={n.kind} />
                </span>
                <Avatar pubkey={n.pubkey} size={32} />
                <div className="min-w-0 flex-1 text-sm">
                  <span>
                    <DisplayName pubkey={n.pubkey} /> <span className={v.color}>{v.text}</span>{' '}
                    <RelativeTime ts={n.created_at} />
                  </span>
                  {n.contentPreview && (
                    <p className="mt-0.5 line-clamp-2 text-ink-soft">{n.contentPreview}</p>
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
