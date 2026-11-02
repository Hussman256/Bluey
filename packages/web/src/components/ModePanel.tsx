import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApprovedTutors } from '../nostr/tutors';
import { useBootcampList } from '../nostr/useBootcamps';
import { useClubList, useClubRosters, useMyClubs } from '../nostr/useClubs';
import { BootcampRow, ContinueCard } from './learn';

type Mode = 'learning' | 'teaching' | 'hosting';
const MODES: { id: Mode; label: string }[] = [
  { id: 'learning', label: 'Learning' },
  { id: 'teaching', label: 'Teaching' },
  { id: 'hosting', label: 'Hosting' },
];
const STORE = 'bluey:profile-mode';

function Empty({ text, to, action }: { text: string; to: string; action: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[18px] border-[1.5px] border-dashed border-line-strong px-3.5 py-3 text-sm">
      <span className="flex-1 text-ink-soft">{text}</span>
      <Link to={to} className="font-semibold text-brand hover:underline">
        {action}
      </Link>
    </div>
  );
}

/**
 * One account, three hats: what you're learning, what you teach, the clubs you
 * host. Only shown on your own profile; the choice is remembered on this device.
 */
export function ModePanel({ pubkey }: { pubkey: string }) {
  const [mode, setMode] = useState<Mode>(() => {
    const saved = localStorage.getItem(STORE);
    return saved === 'teaching' || saved === 'hosting' ? saved : 'learning';
  });
  const { bootcamps } = useBootcampList();
  const tutors = useApprovedTutors();
  const myClubs = useMyClubs();
  const { clubs } = useClubList();
  const rosters = useClubRosters();

  const enrolled = useMemo(() => {
    const ids = new Set(myClubs.map((c) => c.id));
    return bootcamps.filter((b) => b.cohortId && ids.has(b.cohortId) && b.pubkey !== pubkey);
  }, [bootcamps, myClubs, pubkey]);
  const teaching = useMemo(() => bootcamps.filter((b) => b.pubkey === pubkey), [bootcamps, pubkey]);
  const hosting = useMemo(
    () => clubs.filter((c) => rosters.get(c.id)?.admins.includes(pubkey)),
    [clubs, rosters, pubkey],
  );

  function pick(m: Mode) {
    setMode(m);
    localStorage.setItem(STORE, m);
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div role="tablist" aria-label="Mode" className="grid grid-cols-3 gap-1 rounded-2xl bg-sunk p-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => pick(m.id)}
            className={`min-h-10 rounded-xl text-sm ${
              mode === m.id ? 'bg-surface font-semibold text-ink shadow-sm' : 'font-medium text-ink-soft'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'learning' &&
        (enrolled.length ? (
          enrolled.slice(0, 3).map((b) => <ContinueCard key={`${b.pubkey}:${b.id}`} bootcamp={b} />)
        ) : (
          <Empty text="You're not in a bootcamp yet." to="/learn" action="Browse Learn" />
        ))}

      {mode === 'teaching' && (
        <>
          {teaching.map((b) => (
            <BootcampRow
              key={b.id}
              bootcamp={b}
              verified={tutors.isApproved(pubkey)}
              learners={rosters.get(b.cohortId ?? '')?.members.filter((p) => p !== pubkey).length}
            />
          ))}
          <Empty
            text={teaching.length ? 'Run another one?' : "You don't teach a bootcamp yet."}
            to="/teach"
            action={!tutors.configured || tutors.isApproved(pubkey) ? 'New bootcamp' : 'Apply to teach'}
          />
        </>
      )}

      {mode === 'hosting' && (
        <>
          {hosting.map((c) => (
            <Link
              key={c.id}
              to={`/clubs/${c.id}`}
              className="flex items-center gap-3 rounded-[18px] border border-line bg-surface p-3"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft font-display text-sm font-extrabold text-brand" aria-hidden="true">
                {c.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-semibold">{c.name}</span>
                <span className="text-xs text-ink-faint">{rosters.get(c.id)?.members.length ?? 0} members</span>
              </span>
            </Link>
          ))}
          <Empty
            text={hosting.length ? 'Start another club?' : "You don't host a club yet."}
            to="/clubs?new=1"
            action="Start a club"
          />
        </>
      )}
    </div>
  );
}
