import { useProfileValue } from '@nostr-dev-kit/react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { naddrOf, type Bootcamp } from '../nostr/bootcamps';
import { shortNpub } from '../nostr/ids';
import { useLessonsRead } from '../nostr/progress';
import { useLessons, useLiveClasses } from '../nostr/useBootcamps';
import { useNow } from './useNow';

/** Blue check shown next to approved tutors. */
export function VerifiedMark({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size }} className="shrink-0" role="img" aria-label="Verified tutor">
      <circle cx="12" cy="12" r="10" className="fill-brand" />
      <path d="M8 12l3 3 5-6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TutorName({ pubkey, verified }: { pubkey: string; verified: boolean }) {
  const p = useProfileValue(pubkey);
  return (
    <span className="inline-flex items-center gap-1">
      {p?.displayName || p?.name || shortNpub(pubkey)}
      {verified && <VerifiedMark />}
    </span>
  );
}

function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const frac = total ? Math.min(1, done / total) : 0;
  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0" role="img" aria-label={`${done} of ${total} lessons opened`}>
      <circle cx="32" cy="32" r={r} fill="none" strokeWidth="7" className="stroke-slab-line" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${frac * c} ${c}`}
        transform="rotate(-90 32 32)"
        className="stroke-brand-bright"
      />
      <text x="32" y="37" textAnchor="middle" className="fill-white font-mono text-[15px] font-semibold">
        {done}/{total}
      </text>
    </svg>
  );
}

const fmtWhen = (ts: number) =>
  new Date(ts * 1000).toLocaleString(undefined, { weekday: 'long', hour: '2-digit', minute: '2-digit' });

/** Dark "keep going" card for a bootcamp the learner is enrolled in. */
export function ContinueCard({ bootcamp }: { bootcamp: Bootcamp }) {
  const lessons = useLessons(bootcamp);
  const read = useLessonsRead(bootcamp.addr);
  const live = useLiveClasses(bootcamp.addr);
  const now = useNow(60_000);

  const total = bootcamp.lessons.length;
  const done = bootcamp.lessons.filter((a) => read.has(a.identifier)).length;
  const next = lessons.find((l) => !read.has(l.id)) ?? lessons[lessons.length - 1];
  const nextIndex = next ? lessons.indexOf(next) + 1 : 0;

  const session = useMemo(() => {
    return (
      live.find((l) => l.status === 'live') ??
      live
        .filter((l) => l.status === 'planned' && (l.starts ?? 0) > now)
        .sort((a, b) => (a.starts ?? 0) - (b.starts ?? 0))[0]
    );
  }, [live, now]);

  return (
    <section aria-label={`Continue ${bootcamp.title}`} className="flex flex-col gap-3 rounded-[22px] bg-slab p-4 text-white">
      <span className="font-mono text-[11px] font-semibold tracking-[0.08em] text-brand-bright">CONTINUE</span>
      <div className="flex items-center gap-3.5">
        <ProgressRing done={done} total={total} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link to={`/learn/${naddrOf(bootcamp.addr)}`} className="font-display text-[19px] font-bold leading-tight hover:underline">
            {bootcamp.title}
          </Link>
          <span className="truncate text-[13px] text-slab-ink">
            {total === 0
              ? 'No lessons yet'
              : done >= total
                ? 'All lessons opened'
                : next
                  ? `Next: Lesson ${nextIndex} · ${next.title}`
                  : 'Loading lessons…'}
          </span>
        </div>
      </div>
      <div className="flex gap-2">
        {next && (
          <Link
            to={`/lesson/${naddrOf(next.addr)}`}
            className="grid min-h-11 flex-1 place-items-center rounded-xl bg-white text-sm font-semibold text-ink"
          >
            {done === 0 ? 'Start' : 'Resume lesson'}
          </Link>
        )}
        {bootcamp.cohortId && (
          <Link
            to={`/clubs/${bootcamp.cohortId}`}
            className="grid min-h-11 flex-1 place-items-center rounded-xl border border-slab-line text-sm font-medium"
          >
            Cohort club
          </Link>
        )}
      </div>
      {session && (
        <Link to={`/live/${naddrOf(session.addr)}`} className="flex items-center gap-1.5 text-xs text-slab-ink hover:text-white">
          <span className={`h-2 w-2 rounded-full ${session.status === 'live' ? 'bg-live' : 'bg-slab-line'}`} aria-hidden="true" />
          {session.status === 'live'
            ? `Live now: ${session.title}`
            : `Live class ${session.starts ? fmtWhen(session.starts) : 'soon'}`}
        </Link>
      )}
    </section>
  );
}

const TILE_TONES = ['bg-zap-soft text-zap-ink', 'bg-brand-soft text-brand', 'bg-proto-soft text-proto'];

/** One bootcamp in the catalogue. */
export function BootcampRow({
  bootcamp,
  verified,
  learners,
}: {
  bootcamp: Bootcamp;
  verified: boolean;
  learners?: number;
}) {
  const tone = TILE_TONES[bootcamp.title.length % TILE_TONES.length];
  const n = bootcamp.lessons.length;
  return (
    <Link
      to={`/learn/${naddrOf(bootcamp.addr)}`}
      className="flex gap-3 rounded-[18px] border border-line bg-surface p-3 transition hover:border-line-strong"
    >
      {bootcamp.image ? (
        <img src={bootcamp.image} alt="" className="h-16 w-16 shrink-0 rounded-[14px] object-cover" />
      ) : (
        <span className={`grid h-16 w-16 shrink-0 place-items-center rounded-[14px] font-display text-lg font-extrabold ${tone}`} aria-hidden="true">
          {bootcamp.title.slice(0, 2).toUpperCase()}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[15px] font-semibold leading-snug">{bootcamp.title}</span>
        <span className="text-[13px] text-ink-soft">
          <TutorName pubkey={bootcamp.pubkey} verified={verified} />
        </span>
        <span className="text-xs text-ink-faint">
          {n} lesson{n === 1 ? '' : 's'}
          {bootcamp.cohortId ? ' · cohort club' : ''}
          {learners ? ` · ${learners} learner${learners === 1 ? '' : 's'}` : ''}
        </span>
      </span>
      <span className="self-start rounded-md bg-proto-soft px-2 py-0.5 text-xs font-semibold text-proto">Free</span>
    </Link>
  );
}
