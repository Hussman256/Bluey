import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { naddrOf } from '../nostr/bootcamps';
import { useBootcampList, useLiveNow } from '../nostr/useBootcamps';
import { useMyClubs } from '../nostr/useClubs';

/** Horizontal strip of live classes, your clubs' first. Renders nothing when nobody is live. */
export function OnAirStrip() {
  const live = useLiveNow();
  const { bootcamps } = useBootcampList();
  const mine = useMyClubs();

  const { rooms, yours } = useMemo(() => {
    const myIds = new Set(mine.map((c) => c.id));
    const rooms = live.map((l) => {
      const b = bootcamps.find(
        (x) => l.bootcampAddr && x.pubkey === l.bootcampAddr.pubkey && x.id === l.bootcampAddr.identifier,
      );
      return { live: l, bootcamp: b, mine: !!b?.cohortId && myIds.has(b.cohortId) };
    });
    rooms.sort((a, b) => Number(b.mine) - Number(a.mine));
    return { rooms: rooms.slice(0, 8), yours: rooms.some((r) => r.mine) };
  }, [live, bootcamps, mine]);

  if (rooms.length === 0) return null;

  return (
    <section aria-label="On air" className="flex flex-col gap-2 py-3">
      <h2 className="px-4 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
        {yours ? 'On air in your clubs' : 'On air now'}
      </h2>
      <div className="flex gap-2.5 no-scrollbar overflow-x-auto px-4 pb-1">
        {rooms.map(({ live: l, bootcamp }) => (
          <Link
            key={`${l.pubkey}:${l.id}`}
            to={`/live/${naddrOf(l.addr)}`}
            className="flex w-52 shrink-0 flex-col gap-1.5 rounded-2xl bg-slab p-3 text-white"
          >
            <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-[0.06em] text-live">
              <span className="h-2 w-2 rounded-full bg-live" aria-hidden="true" />
              ON AIR
            </span>
            <span className="line-clamp-2 text-[15px] font-semibold leading-snug">{l.title}</span>
            {bootcamp && <span className="truncate text-xs text-slab-ink">{bootcamp.title}</span>}
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Link card to the weekly builders board. */
export function BoardCard() {
  return (
    <Link to="/board" className="flex items-center gap-3 border-b border-line px-4 py-3 active:bg-sunk">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft text-brand" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.9">
          <path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20h6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-semibold">This week's builders</span>
        <span className="truncate text-[13px] text-ink-faint">Ranked by vouched Ships and finished bootcamps</span>
      </span>
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] text-ink-faint" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}
