import { useFollows, useNDKCurrentUser } from '@nostr-dev-kit/react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { naddrOf, type LiveClass } from '../nostr/bootcamps';
import type { ClubMeta } from '../nostr/clubs';
import { useBootcampList, useLiveNow } from '../nostr/useBootcamps';
import { useClubActions, useClubList, useClubRosters, useMyClubs } from '../nostr/useClubs';

const TONES = ['bg-slab text-white', 'bg-brand text-white', 'bg-proto-soft text-proto', 'bg-zap-soft text-zap-ink'];

function ClubTile({ club, size = 48 }: { club: ClubMeta; size?: number }) {
  if (club.picture) {
    return <img src={club.picture} alt="" className="shrink-0 rounded-[14px] object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-[14px] font-display text-base font-extrabold ${TONES[club.name.length % TONES.length]}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {club.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function ClubsPage() {
  const me = useNDKCurrentUser();
  const follows = useFollows();
  const { clubs, loading } = useClubList();
  const mine = useMyClubs();
  const rosters = useClubRosters();
  const { bootcamps } = useBootcampList();
  const liveNow = useLiveNow();
  const actions = useClubActions();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [creating, setCreating] = useState(params.has('new'));
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  // cohort clubs belong to a bootcamp; a live class of that bootcamp makes the club "live"
  const { cohorts, liveIn } = useMemo(() => {
    const cohorts = new Set(bootcamps.map((b) => b.cohortId).filter(Boolean));
    const liveIn = new Map<string, LiveClass>();
    for (const l of liveNow) {
      const b = bootcamps.find(
        (x) => l.bootcampAddr && x.pubkey === l.bootcampAddr.pubkey && x.id === l.bootcampAddr.identifier,
      );
      if (b?.cohortId && !liveIn.has(b.cohortId)) liveIn.set(b.cohortId, l);
    }
    return { cohorts, liveIn };
  }, [bootcamps, liveNow]);

  const q = query.trim().toLowerCase();
  const match = (c: ClubMeta) => !q || c.name.toLowerCase().includes(q) || c.about?.toLowerCase().includes(q);
  const mineIds = new Set(mine.map((c) => c.id));
  const yours = mine.filter(match).sort((a, b) => Number(liveIn.has(b.id)) - Number(liveIn.has(a.id)));
  const others = clubs
    .filter((c) => !mineIds.has(c.id) && match(c))
    .map((c) => {
      const members = rosters.get(c.id)?.members ?? [];
      return { club: c, members: members.length, known: members.filter((p) => follows.has(p)).length };
    })
    .sort((a, b) => b.known - a.known || b.members - a.members);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy('create');
    try {
      const id = await actions.create(name.trim(), about.trim() || undefined);
      navigate(`/clubs/${id}`);
    } finally {
      setBusy(null);
    }
  }

  async function join(id: string) {
    setBusy(id);
    try {
      await actions.join(id);
      navigate(`/clubs/${id}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <header className="flex flex-col gap-3 px-4 pt-4">
        <div className="flex items-center gap-2.5">
          <h1 className="flex-1 font-display text-[30px] font-extrabold">Clubs</h1>
          {me && (
            <button
              type="button"
              onClick={() => setCreating((v) => !v)}
              className="flex min-h-11 items-center gap-1.5 rounded-2xl bg-slab px-3.5 text-sm font-semibold text-white"
            >
              {creating ? 'Cancel' : '+ Start a club'}
            </button>
          )}
        </div>
        <label className="flex min-h-11 items-center gap-2 rounded-2xl border border-line bg-surface px-3">
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] text-ink-faint" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" strokeLinecap="round" />
          </svg>
          <span className="sr-only">Search clubs</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a club"
            className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-faint"
          />
        </label>
      </header>

      {creating && (
        <form onSubmit={create} className="mx-3 flex flex-col gap-2.5 rounded-[20px] border border-line bg-surface p-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Club name, e.g. Lightning Study Group"
            className="rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand"
          />
          <textarea
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            rows={2}
            placeholder="What's this club for? (optional)"
            className="resize-none rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand"
          />
          <button
            type="submit"
            disabled={!name.trim() || busy === 'create'}
            className="min-h-11 rounded-xl bg-brand text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy === 'create' ? 'Creating…' : 'Create club'}
          </button>
          <p className="text-xs text-ink-faint">Free and open: anyone can join. You'll be the owner.</p>
        </form>
      )}

      {yours.length > 0 && (
        <section aria-label="Your clubs" className="mx-3 flex flex-col gap-0.5 rounded-[20px] border border-line bg-surface p-1.5">
          <h2 className="mx-2 mb-1 mt-1.5 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">Yours</h2>
          {yours.map((c) => {
            const live = liveIn.get(c.id);
            return (
              <div key={c.id} className={`flex items-center gap-3 rounded-[14px] px-2 py-2.5 ${live ? 'bg-live/10' : ''}`}>
                <Link to={`/clubs/${c.id}`} className="relative">
                  <ClubTile club={c} />
                  {live && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-surface bg-live" aria-hidden="true" />
                  )}
                </Link>
                <Link to={`/clubs/${c.id}`} className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 text-[15px] font-semibold">
                    <span className="truncate">{c.name}</span>
                    {cohorts.has(c.id) && (
                      <span className="shrink-0 rounded-[5px] bg-brand-soft px-1.5 text-[11px] font-semibold text-brand">Cohort</span>
                    )}
                  </span>
                  <span className={`truncate text-[13px] ${live ? 'font-medium text-live-ink' : 'text-ink-faint'}`}>
                    {live ? `Live now · ${live.title}` : (c.about ?? `${rosters.get(c.id)?.members.length ?? 0} members`)}
                  </span>
                </Link>
                {live && (
                  <Link
                    to={`/live/${naddrOf(live.addr)}`}
                    className="grid min-h-9 place-items-center rounded-[10px] bg-live-ink px-3 text-[13px] font-semibold text-white"
                  >
                    Join room
                  </Link>
                )}
              </div>
            );
          })}
        </section>
      )}

      <section aria-label="Find clubs" className="flex flex-col gap-2.5 px-3">
        <h2 className="px-1 font-display text-lg font-bold">{yours.length ? 'Worth joining' : 'Find your people'}</h2>
        {loading && clubs.length === 0 && (
          <p className="py-8 text-center font-mono text-xs text-ink-faint">loading clubs…</p>
        )}
        {!loading && others.length === 0 && (
          <p className="py-8 text-center text-sm text-ink-soft">
            {q ? 'No clubs match that.' : clubs.length ? "You're in every club. Start a new one." : 'No clubs yet. Start the first one.'}
          </p>
        )}
        {others.slice(0, 30).map(({ club: c, members, known }) => (
          <div key={c.id} className="flex items-center gap-3 rounded-[18px] border border-line bg-surface p-3">
            <Link to={`/clubs/${c.id}`}>
              <ClubTile club={c} size={44} />
            </Link>
            <Link to={`/clubs/${c.id}`} className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[15px] font-semibold">{c.name}</span>
              <span className="truncate text-xs text-ink-faint">
                {members} member{members === 1 ? '' : 's'}
                {known > 0 && ` · ${known} you follow`}
                {cohorts.has(c.id) && ' · bootcamp cohort'}
              </span>
            </Link>
            {me && c.open && (
              <button
                type="button"
                onClick={() => join(c.id)}
                disabled={busy === c.id}
                className="min-h-10 rounded-xl border-[1.5px] border-brand px-4 text-sm font-semibold text-brand disabled:opacity-50"
              >
                {busy === c.id ? '…' : 'Join'}
              </button>
            )}
          </div>
        ))}
        <p className="px-1 text-xs text-ink-faint">Every club is free to join.</p>
      </section>
    </div>
  );
}
