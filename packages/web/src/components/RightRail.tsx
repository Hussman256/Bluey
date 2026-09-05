import { useNDKCurrentUser, useProfileValue } from '@nostr-dev-kit/react';
import { Link } from 'react-router-dom';
import type { NDKEvent } from '@nostr-dev-kit/ndk';
import { useIndexFeed } from '../nostr/useIndex';
import { Avatar } from './primitives';

const snippet = (s: string) =>
  s.replace(/\s+/g, ' ').replace(/https?:\/\/\S+/g, '').trim().slice(0, 96);

function TrendingRow({ event }: { event: NDKEvent }) {
  const profile = useProfileValue(event.pubkey);
  const name = profile?.displayName || profile?.name || 'someone';
  const text = snippet(event.content);
  if (!text) return null;
  return (
    <Link to={`/e/${event.encode()}`} className="flex gap-2.5 py-3 first:pt-0">
      <Avatar pubkey={event.pubkey} size={28} />
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold">{name}</div>
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink-soft">{text}</p>
      </div>
    </Link>
  );
}

export function RightRail() {
  const me = useNDKCurrentUser();
  const { data, fromIndex } = useIndexFeed({ scope: 'discover', pubkey: me?.pubkey, limit: 12 });

  const trending = (data ?? [])
    .filter((e) => snippet(e.content).length > 20 && !e.tags.some((t) => t[0] === 'e'))
    .slice(0, 5);

  return (
    <aside className="sticky top-8 hidden h-[calc(100dvh-2rem)] w-[340px] shrink-0 flex-col gap-6 overflow-y-auto px-6 py-6 xl:flex">
      <Link
        to="/search"
        className="flex items-center gap-2.5 rounded-full bg-surface px-4 py-2.5 text-[13.5px] text-ink-faint transition hover:text-ink-soft"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
        </svg>
        Search
      </Link>

      {fromIndex && trending.length > 0 && (
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="font-display text-base font-extrabold">Trending</h2>
            <span className="font-mono text-[10px] text-ink-faint">web of trust</span>
          </div>
          <div className="divide-y divide-line">
            {trending.map((e) => (
              <TrendingRow key={e.id} event={e} />
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
