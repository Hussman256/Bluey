import { useNDKCurrentUser, useProfileValue } from '@nostr-dev-kit/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { TrendingTimeframe } from '@bluey/shared';
import type { NDKEvent } from '@nostr-dev-kit/ndk';
import { feedLangMode, inReadableScript, readableScripts } from '../nostr/lang';
import { isMuted, useMutes } from '../nostr/mutes';
import { isJunkNote } from '../nostr/notes';
import { useIndexFeed } from '../nostr/useIndex';
import { Avatar } from './primitives';

const snippet = (s: string) =>
  s.replace(/\s+/g, ' ').replace(/https?:\/\/\S+/g, '').trim().slice(0, 96);

function TrendingRow({ event, rank }: { event: NDKEvent; rank: number }) {
  const profile = useProfileValue(event.pubkey);
  const name = profile?.displayName || profile?.name || 'someone';
  const text = snippet(event.content);
  if (!text) return null;
  return (
    <Link to={`/e/${event.encode()}`} className="flex items-start gap-2.5 py-3 first:pt-0 group">
      <span className="font-mono text-xs font-bold text-ink-faint w-4 pt-1 text-center shrink-0 group-hover:text-ink">
        {rank}
      </span>
      <Avatar pubkey={event.pubkey} size={28} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold">{name}</div>
        <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-ink-soft group-hover:text-ink">{text}</p>
      </div>
    </Link>
  );
}

const TIMEFRAMES: { label: string; value: TrendingTimeframe }[] = [
  { label: '4h', value: '4h' },
  { label: '24h', value: '24h' },
  { label: '7d', value: '7d' },
];

export function RightRail() {
  const me = useNDKCurrentUser();
  const mutes = useMutes();
  const [timeframe, setTimeframe] = useState<TrendingTimeframe>('24h');
  const { data, fromIndex } = useIndexFeed({
    scope: 'trending',
    timeframe,
    pubkey: me?.pubkey,
    limit: 20,
  });
  // fallback feed if trending has few items
  const { data: discoverData } = useIndexFeed({
    scope: 'discover',
    pubkey: me?.pubkey,
    limit: 10,
  });

  const langFilter = feedLangMode() === 'mine';
  const scripts = readableScripts();

  const sourceList = (data && data.length > 0 ? data : (discoverData ?? []));

  const trending = sourceList
    .filter(
      (e) =>
        !isJunkNote(e) &&
        !isMuted(e, mutes) &&
        snippet(e.content).length > 20 &&
        !e.tags.some((t) => t[0] === 'e') &&
        (!langFilter || inReadableScript(e.content, scripts)),
    )
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
        <div className="rounded-2xl border border-line bg-surface/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-base font-extrabold">Trending</h2>
            <div className="flex items-center gap-1 bg-surface rounded-lg p-0.5 text-[11px] font-mono">
              {TIMEFRAMES.map((tf) => (
                <button
                  key={tf.value}
                  type="button"
                  onClick={() => setTimeframe(tf.value)}
                  className={`px-2 py-0.5 rounded transition ${
                    timeframe === tf.value
                      ? 'bg-bg text-ink font-bold shadow-xs'
                      : 'text-ink-faint hover:text-ink'
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-line">
            {trending.map((e, idx) => (
              <TrendingRow key={e.id} event={e} rank={idx + 1} />
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
