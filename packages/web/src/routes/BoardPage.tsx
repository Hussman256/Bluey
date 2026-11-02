import { useNDKCurrentUser } from '@nostr-dev-kit/react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar, DisplayName } from '../components/primitives';
import { useWeeklyBoard, type BuilderRow } from '../nostr/board';
import { useClubList } from '../nostr/useClubs';

type Tab = 'builders' | 'tutors' | 'clubs';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function builderFacts(r: BuilderRow) {
  return [
    r.ships && plural(r.ships, 'Ship'),
    r.vouchesReceived && `${plural(r.vouchesReceived, 'vouch', 'vouches')} received`,
    r.finished && `${plural(r.finished, 'bootcamp')} finished`,
    r.vouchesGiven && `${plural(r.vouchesGiven, 'vouch', 'vouches')} given`,
  ]
    .filter(Boolean)
    .join(' · ');
}

function Rank({ n }: { n: number }) {
  return <span className="w-7 shrink-0 text-center font-mono text-[15px] font-semibold text-ink-soft">{n}</span>;
}

const rowCls = (top: boolean) =>
  `flex items-center gap-3 rounded-2xl border bg-surface px-3 py-2.5 ${top ? 'border-brand/35' : 'border-line'}`;

export function BoardPage() {
  const me = useNDKCurrentUser();
  const navigate = useNavigate();
  const board = useWeeklyBoard();
  const { clubs } = useClubList();
  const [tab, setTab] = useState<Tab>('builders');

  const start = new Date(board.since * 1000);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const myRank = me ? board.builders.findIndex((r) => r.pubkey === me.pubkey) : -1;
  const clubName = (id: string) => clubs.find((c) => c.id === id)?.name ?? 'Club';

  return (
    <div className="flex flex-col">
      <header className="flex flex-col gap-3.5 bg-slab px-4 pb-5 pt-4 text-white">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="font-mono text-xs font-semibold tracking-[0.08em] text-brand-bright">
            THIS WEEK · {fmt(start).toUpperCase()} – {fmt(end).toUpperCase()}
          </span>
        </div>
        <h1 className="font-display text-[30px] font-extrabold leading-[1.1]">Who showed up this week</h1>
        <p className="text-[13px] leading-relaxed text-slab-ink">
          Ranked by vouched Ships, bootcamps finished and vouches given. Built from public Nostr events, so
          anyone can check it. No points to buy or farm.
        </p>
        <div role="tablist" aria-label="Board" className="grid grid-cols-3 gap-1 rounded-2xl bg-white/10 p-1">
          {(['builders', 'tutors', 'clubs'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`min-h-10 rounded-xl text-sm capitalize ${
                tab === t ? 'bg-white font-semibold text-ink' : 'font-medium text-slab-ink'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </header>

      <ol className="flex flex-col gap-2 px-3 py-3.5">
        {tab === 'builders' &&
          board.builders.slice(0, 25).map((r, i) => (
            <li key={r.pubkey} className={rowCls(i < 3)}>
              <Rank n={i + 1} />
              <Avatar pubkey={r.pubkey} size={40} />
              <span className="flex min-w-0 flex-1 flex-col">
                <DisplayName pubkey={r.pubkey} className="truncate text-[15px]" />
                <span className="text-xs text-ink-faint">{builderFacts(r)}</span>
              </span>
            </li>
          ))}
        {tab === 'tutors' &&
          board.tutors.slice(0, 25).map((r, i) => (
            <li key={r.pubkey} className={rowCls(i < 3)}>
              <Rank n={i + 1} />
              <Avatar pubkey={r.pubkey} size={40} />
              <span className="flex min-w-0 flex-1 flex-col">
                <DisplayName pubkey={r.pubkey} className="truncate text-[15px]" />
                <span className="text-xs text-ink-faint">
                  {[
                    r.badgesAwarded && `${plural(r.badgesAwarded, 'learner')} finished`,
                    r.liveClasses && plural(r.liveClasses, 'live class', 'live classes'),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
            </li>
          ))}
        {tab === 'clubs' &&
          board.clubs.slice(0, 25).map((r, i) => (
            <li key={r.id} className={rowCls(i < 3)}>
              <Rank n={i + 1} />
              <Link to={`/clubs/${r.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft font-display text-sm font-extrabold text-brand" aria-hidden="true">
                  {clubName(r.id).slice(0, 2).toUpperCase()}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] font-semibold">{clubName(r.id)}</span>
                  <span className="text-xs text-ink-faint">
                    {[
                      `${plural(r.posters, 'member')} active`,
                      r.ships && `${plural(r.ships, 'Ship')} shared`,
                      r.messages && plural(r.messages, 'message'),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </Link>
            </li>
          ))}

        {((tab === 'builders' && board.builders.length === 0) ||
          (tab === 'tutors' && board.tutors.length === 0) ||
          (tab === 'clubs' && board.clubs.length === 0)) && (
          <li className="py-10 text-center text-sm text-ink-soft">Nothing yet this week. Be the first to show up.</li>
        )}
      </ol>

      {tab === 'builders' && me && (
        <div className="mx-3 mb-6 flex items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-line-strong px-3 py-3">
          <span className="w-7 text-center font-mono text-[15px] font-semibold text-brand">
            {myRank >= 0 ? myRank + 1 : '–'}
          </span>
          <span className="flex-1 text-[13px] leading-snug text-ink-soft">
            <strong className="text-ink">You</strong> ·{' '}
            {myRank >= 0 ? builderFacts(board.builders[myRank]) : 'Nothing yet this week.'}{' '}
            <Link to="/ship/new" className="font-semibold text-brand hover:underline">
              Ship something
            </Link>
          </span>
        </div>
      )}
    </div>
  );
}
