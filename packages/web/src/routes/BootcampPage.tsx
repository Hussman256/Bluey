import { useNDK, useNDKCurrentUser } from '@nostr-dev-kit/react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { KIND } from '../nostr/kinds';
import { addrFromNaddr, naddrOf } from '../nostr/bootcamps';
import { awardEvent, badgeDefEvent, completionBadgeId } from '../nostr/badges';
import {
  useBootcamp,
  useBootcampActions,
  useLessons,
  useLiveClasses,
} from '../nostr/useBootcamps';
import { useClub, useClubActions } from '../nostr/useClubs';
import { DisplayName } from '../components/primitives';

export function BootcampPage() {
  const { naddr } = useParams();
  const addr = naddr ? addrFromNaddr(naddr) : null;
  const { ndk } = useNDK();
  const me = useNDKCurrentUser();
  const bootcamp = useBootcamp(addr?.pubkey, addr?.identifier);
  const lessons = useLessons(bootcamp);
  const liveClasses = useLiveClasses(bootcamp?.addr);
  const cohort = useClub(bootcamp?.cohortId);
  const clubActions = useClubActions();
  const actions = useBootcampActions();

  const isTutor = me?.pubkey === bootcamp?.pubkey;
  const enrolled = cohort.isMember;

  const [busy, setBusy] = useState<string | null>(null);
  const [showLesson, setShowLesson] = useState(false);
  const [lTitle, setLTitle] = useState('');
  const [lContent, setLContent] = useState('');
  const [showLive, setShowLive] = useState(false);
  const [liveTitle, setLiveTitle] = useState('');
  const [liveUrl, setLiveUrl] = useState('');

  async function enrol() {
    if (!bootcamp?.cohortId) return;
    setBusy('enrol');
    try {
      await clubActions.join(bootcamp.cohortId);
    } finally {
      setBusy(null);
    }
  }

  async function addLesson(e: React.FormEvent) {
    e.preventDefault();
    if (!bootcamp || !lTitle.trim() || !lContent.trim()) return;
    setBusy('lesson');
    try {
      await actions.addLesson(bootcamp, { title: lTitle.trim(), content: lContent.trim() });
      setLTitle('');
      setLContent('');
      setShowLesson(false);
    } finally {
      setBusy(null);
    }
  }

  async function scheduleLive(e: React.FormEvent) {
    e.preventDefault();
    if (!bootcamp || !liveTitle.trim()) return;
    setBusy('live');
    try {
      await actions.scheduleLive(bootcamp, {
        title: liveTitle.trim(),
        streaming: liveUrl.trim() || undefined,
      });
      setLiveTitle('');
      setLiveUrl('');
      setShowLive(false);
    } finally {
      setBusy(null);
    }
  }

  const [awarded, setAwarded] = useState<Set<string>>(new Set());

  async function publishBadge() {
    if (!ndk || !bootcamp) return;
    setBusy('badge');
    try {
      await badgeDefEvent(ndk, bootcamp).publish();
    } finally {
      setBusy(null);
    }
  }

  async function award(learner: string) {
    if (!ndk || !bootcamp) return;
    setBusy('award:' + learner);
    try {
      await badgeDefEvent(ndk, bootcamp).publish(); // idempotent — ensure the def exists
      await awardEvent(ndk, {
        kind: KIND.BadgeDefinition,
        pubkey: bootcamp.pubkey,
        identifier: completionBadgeId(bootcamp.id),
      }, learner).publish();
      setAwarded((s) => new Set(s).add(learner));
    } finally {
      setBusy(null);
    }
  }

  if (!addr) return <p className="p-8 text-center text-sm text-ink-soft">Unknown bootcamp.</p>;
  if (!bootcamp)
    return <p className="px-4 py-12 text-center font-mono text-xs text-ink-faint">loading…</p>;

  return (
    <div>
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur">
        <Link to="/learn" className="text-ink-faint hover:text-ink" aria-label="All bootcamps">
          ←
        </Link>
        <span className="truncate font-display font-semibold">{bootcamp.title}</span>
      </header>

      <div className="border-b border-line px-4 py-4">
        <p className="text-xs text-ink-faint">
          by <DisplayName pubkey={bootcamp.pubkey} className="text-xs" />
        </p>
        {bootcamp.description && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{bootcamp.description}</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {!isTutor &&
            me &&
            (enrolled ? (
              <span className="rounded-full bg-good/10 px-3 py-1.5 text-xs font-semibold text-good">
                Enrolled ✓
              </span>
            ) : (
              <button
                type="button"
                onClick={enrol}
                disabled={busy !== null}
                className="rounded-full bg-zap px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
              >
                {busy === 'enrol' ? '…' : 'Enrol — free'}
              </button>
            ))}
          {bootcamp.cohortId && (enrolled || isTutor) && (
            <Link
              to={`/clubs/${bootcamp.cohortId}`}
              className="rounded-full border border-line-strong px-3 py-1.5 text-xs font-semibold hover:border-zap hover:text-ink-soft"
            >
              Cohort chat →
            </Link>
          )}
          <span className="font-mono text-xs text-ink-faint">
            {cohort.members.length} enrolled
          </span>
        </div>
      </div>

      {/* curriculum */}
      <section>
        <div className="flex items-center justify-between border-b border-line px-4 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Curriculum</h2>
          {isTutor && (
            <button
              type="button"
              onClick={() => setShowLesson((v) => !v)}
              className="text-xs font-semibold text-zap-ink hover:underline"
            >
              {showLesson ? 'cancel' : '+ lesson'}
            </button>
          )}
        </div>

        {showLesson && (
          <form onSubmit={addLesson} className="flex flex-col gap-2 border-b border-line px-4 py-3">
            <input
              value={lTitle}
              onChange={(e) => setLTitle(e.target.value)}
              placeholder="Lesson title"
              className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm outline-none focus:border-zap"
            />
            <textarea
              value={lContent}
              onChange={(e) => setLContent(e.target.value)}
              rows={5}
              placeholder="Lesson content (Markdown supported)"
              className="resize-none rounded-lg border border-line-strong bg-surface px-3 py-2 font-mono text-xs outline-none focus:border-zap"
            />
            <button
              type="submit"
              disabled={busy === 'lesson' || !lTitle.trim() || !lContent.trim()}
              className="self-start rounded-full bg-slab px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
            >
              {busy === 'lesson' ? 'Publishing…' : 'Publish lesson'}
            </button>
          </form>
        )}

        {lessons.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-soft">No lessons yet.</p>
        ) : (
          <ol className="divide-y divide-line">
            {lessons.map((l, i) => (
              <li key={`${l.pubkey}:${l.id}`}>
                <Link
                  to={`/lesson/${naddrOf(l.addr)}`}
                  className="flex items-baseline gap-3 px-4 py-3 transition hover:bg-surface/40"
                >
                  <span className="font-mono text-xs text-ink-faint tabular-nums">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="font-medium">{l.title}</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* live classes */}
      <section>
        <div className="flex items-center justify-between border-b border-line px-4 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Live classes
          </h2>
          {isTutor && (
            <button
              type="button"
              onClick={() => setShowLive((v) => !v)}
              className="text-xs font-semibold text-zap-ink hover:underline"
            >
              {showLive ? 'cancel' : '+ schedule'}
            </button>
          )}
        </div>

        {showLive && (
          <form onSubmit={scheduleLive} className="flex flex-col gap-2 border-b border-line px-4 py-3">
            <input
              value={liveTitle}
              onChange={(e) => setLiveTitle(e.target.value)}
              placeholder="Session title"
              className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm outline-none focus:border-zap"
            />
            <input
              value={liveUrl}
              onChange={(e) => setLiveUrl(e.target.value)}
              placeholder="Stream URL (HLS / YouTube / Twitch) — optional, add later"
              className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 font-mono text-xs outline-none focus:border-zap"
            />
            <button
              type="submit"
              disabled={busy === 'live' || !liveTitle.trim()}
              className="self-start rounded-full bg-slab px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
            >
              {busy === 'live' ? 'Scheduling…' : 'Schedule'}
            </button>
          </form>
        )}

        {liveClasses.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-soft">No sessions scheduled.</p>
        ) : (
          <ul className="divide-y divide-line">
            {liveClasses.map((lc) => (
              <li key={`${lc.pubkey}:${lc.id}`}>
                <Link
                  to={`/live/${naddrOf(lc.addr)}`}
                  className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface/40"
                >
                  <span
                    className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase ${
                      lc.status === 'live'
                        ? 'bg-danger/15 text-danger'
                        : lc.status === 'ended'
                          ? 'bg-sunk text-ink-faint'
                          : 'bg-zap-soft text-zap-ink'
                    }`}
                  >
                    {lc.status}
                  </span>
                  <span className="font-medium">{lc.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isTutor && (
        <section className="border-t border-line px-4 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Cohort — award completion
            </h2>
            <button
              type="button"
              onClick={publishBadge}
              disabled={busy === 'badge'}
              className="text-xs font-semibold text-zap-ink hover:underline disabled:opacity-40"
            >
              {busy === 'badge' ? '…' : 'define badge'}
            </button>
          </div>
          {cohort.members.filter((p) => p !== bootcamp.pubkey).length === 0 ? (
            <p className="mt-2 text-xs text-ink-faint">No one enrolled yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {cohort.members
                .filter((p) => p !== bootcamp.pubkey)
                .map((p) => (
                  <li key={p} className="flex items-center justify-between py-2 text-sm">
                    <DisplayName pubkey={p} />
                    <button
                      type="button"
                      onClick={() => award(p)}
                      disabled={busy === 'award:' + p || awarded.has(p)}
                      className="rounded-full border border-line-strong px-3 py-1 text-xs font-semibold hover:border-zap hover:text-zap disabled:opacity-40"
                    >
                      {awarded.has(p) ? 'Awarded ✓' : busy === 'award:' + p ? '…' : 'Award'}
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
