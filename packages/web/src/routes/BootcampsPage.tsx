import { BOOTCAMP_TOPICS, type BootcampTopic } from '@bluey/shared';
import { useNDKCurrentUser } from '@nostr-dev-kit/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BootcampRow, ContinueCard } from '../components/learn';
import { TOPIC_LABEL } from '../nostr/bootcamps';
import { useApprovedTutors } from '../nostr/tutors';
import { useBootcampList } from '../nostr/useBootcamps';
import { useClubRosters, useMyClubs } from '../nostr/useClubs';

export function BootcampsPage() {
  const me = useNDKCurrentUser();
  const { bootcamps, loading } = useBootcampList();
  const tutors = useApprovedTutors();
  const myClubs = useMyClubs();
  const rosters = useClubRosters();
  const [topic, setTopic] = useState<BootcampTopic | null>(null);

  const enrolled = useMemo(() => {
    const ids = new Set(myClubs.map((c) => c.id));
    return bootcamps.filter((b) => b.cohortId && ids.has(b.cohortId) && b.pubkey !== me?.pubkey);
  }, [bootcamps, myClubs, me?.pubkey]);

  // with a curator configured, only approved tutors reach the catalogue
  const catalogue = useMemo(
    () =>
      bootcamps.filter(
        (b) => (!tutors.configured || tutors.isApproved(b.pubkey)) && (!topic || b.topics.includes(topic)),
      ),
    [bootcamps, tutors, topic],
  );

  const learnersOf = (cohortId?: string) => {
    const r = cohortId ? rosters.get(cohortId) : undefined;
    return r ? r.members.filter((p) => !r.admins.includes(p)).length : undefined;
  };

  return (
    <div className="flex flex-col gap-4 pb-6">
      <header className="flex items-center gap-2.5 px-4 pt-4">
        <h1 className="flex-1 font-display text-[30px] font-extrabold">Learn</h1>
        <Link
          to="/search"
          aria-label="Search"
          className="grid h-11 w-11 place-items-center rounded-2xl border border-line bg-surface"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" strokeLinecap="round" />
          </svg>
        </Link>
      </header>

      {enrolled.length > 0 && (
        <div className="flex flex-col gap-3 px-3">
          {enrolled.slice(0, 3).map((b) => (
            <ContinueCard key={`${b.pubkey}:${b.id}`} bootcamp={b} />
          ))}
        </div>
      )}

      <div role="group" aria-label="Topics" className="flex gap-2 overflow-x-auto px-4 pb-1">
        {[null, ...BOOTCAMP_TOPICS].map((t) => (
          <button
            key={t ?? 'all'}
            type="button"
            aria-pressed={topic === t}
            onClick={() => setTopic(t)}
            className={`min-h-9 shrink-0 rounded-[10px] px-3.5 text-sm ${
              topic === t
                ? 'bg-brand font-semibold text-white'
                : 'border border-line bg-surface hover:border-line-strong'
            }`}
          >
            {t ? TOPIC_LABEL[t] : 'All'}
          </button>
        ))}
      </div>

      <section aria-label="Bootcamps" className="flex flex-col gap-2.5 px-3">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="font-display text-lg font-bold">
            {tutors.configured ? 'Verified tutors' : 'Bootcamps'}
          </h2>
          {tutors.configured && <span className="text-[13px] text-ink-faint">Reviewed by Bluey</span>}
        </div>

        {(loading || tutors.loading) && catalogue.length === 0 && (
          <p className="py-8 text-center font-mono text-xs text-ink-faint">loading…</p>
        )}
        {!loading && !tutors.loading && catalogue.length === 0 && (
          <p className="py-8 text-center text-sm text-ink-soft">
            {topic ? `No ${TOPIC_LABEL[topic]} bootcamps yet.` : 'No bootcamps yet.'}
          </p>
        )}
        {catalogue.map((b) => (
          <BootcampRow
            key={`${b.pubkey}:${b.id}`}
            bootcamp={b}
            verified={tutors.isApproved(b.pubkey)}
            learners={learnersOf(b.cohortId)}
          />
        ))}
      </section>

      <Link
        to="/teach"
        className="mx-3 flex items-center gap-3 rounded-[18px] border-[1.5px] border-dashed border-line-strong px-3.5 py-3.5"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0 text-brand" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2zM22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z" strokeLinejoin="round" />
        </svg>
        <span className="flex-1 text-sm">
          <strong>Teach on Bluey</strong>
          <br />
          <span className="text-ink-soft">
            {me && (tutors.isApproved(me.pubkey) || !tutors.configured)
              ? 'Create a bootcamp'
              : 'Apply to become a verified tutor'}
          </span>
        </span>
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] text-brand" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
    </div>
  );
}
