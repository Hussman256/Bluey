import { BOOTCAMP_TOPICS, type BootcampTopic } from '@bluey/shared';
import { useNDKCurrentUser } from '@nostr-dev-kit/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { VerifiedMark } from '../components/learn';
import { naddrOf, TOPIC_LABEL } from '../nostr/bootcamps';
import { useApplyToTeach, useApprovedTutors, useTutorAdmin } from '../nostr/tutors';
import { useBootcampActions } from '../nostr/useBootcamps';

const field =
  'w-full rounded-2xl border border-line-strong bg-surface px-4 py-3 text-[15px] outline-none placeholder:text-ink-faint focus:border-brand';

function BackHeader({ title }: { title: string }) {
  const navigate = useNavigate();
  return (
    <header className="flex items-center gap-2.5 px-4 pt-4">
      <button
        type="button"
        onClick={() => navigate(-1)}
        aria-label="Back"
        className="grid h-11 w-11 place-items-center rounded-2xl border border-line bg-surface"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <h1 className="font-display text-xl font-extrabold">{title}</h1>
    </header>
  );
}

function CreateBootcamp() {
  const { create } = useBootcampActions();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [topics, setTopics] = useState<BootcampTopic[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const { pubkey, id } = await create(title.trim(), desc.trim() || undefined, topics);
      navigate(`/learn/${naddrOf({ kind: 30004, pubkey, identifier: id })}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create the bootcamp');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5 px-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Bootcamp title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ship a Nostr client in 2 weeks" className={field} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Who is it for, and what will they build?</span>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} className={`${field} resize-none leading-relaxed`} />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">Topics</legend>
        <div className="flex flex-wrap gap-2">
          {BOOTCAMP_TOPICS.map((t) => {
            const on = topics.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                onClick={() => setTopics(on ? topics.filter((x) => x !== t) : [...topics, t])}
                className={`min-h-10 rounded-xl px-3.5 text-sm ${
                  on ? 'border-[1.5px] border-ink bg-ink font-semibold text-white' : 'border border-line-strong bg-surface'
                }`}
              >
                {TOPIC_LABEL[t]}
              </button>
            );
          })}
        </div>
      </fieldset>
      <p className="text-xs text-ink-faint">
        Free to enrol. Bluey creates a cohort club for your learners. You add lessons and live classes next.
      </p>
      {err && <p className="text-sm text-danger">{err}</p>}
      <button
        type="submit"
        disabled={!title.trim() || busy}
        className="min-h-[52px] rounded-2xl bg-brand text-base font-semibold text-white disabled:opacity-40"
      >
        {busy ? 'Creating…' : 'Create bootcamp'}
      </button>
    </form>
  );
}

function Apply() {
  const apply = useApplyToTeach();
  const [skills, setSkills] = useState('');
  const [idea, setIdea] = useState('');
  const [links, setLinks] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    setErr(null);
    try {
      await apply(
        [
          'Bluey tutor application',
          '',
          `What I know: ${skills.trim()}`,
          `The class I want to run: ${idea.trim()}`,
          ...(links.trim() ? [`My work: ${links.trim()}`] : []),
        ].join('\n'),
      );
      setState('sent');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send');
      setState('idle');
    }
  }

  if (state === 'sent') {
    return (
      <div className="mx-4 flex flex-col gap-2 rounded-[22px] border border-line bg-surface p-5">
        <h2 className="font-display text-lg font-bold">Application sent</h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          It went to the Bluey team as a private Nostr message. When you're approved, a check appears next to
          your name and you can create bootcamps from this page.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 px-4">
      <section className="flex flex-col gap-3 rounded-[22px] bg-slab p-5 text-white">
        <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-slab-line px-2.5 py-1 text-xs text-slab-ink">
          <VerifiedMark size={13} /> Reviewed by the Bluey team
        </span>
        <h2 className="font-display text-[26px] font-extrabold leading-tight">Teach what you know.</h2>
        <p className="text-sm leading-relaxed text-slab-ink">
          Only verified tutors appear in Learn, so learners can trust who they learn from. Tell us what you know and
          the class you'd like to run.
        </p>
      </section>

      <ul className="flex flex-col gap-2.5">
        {[
          ['A bootcamp page', 'Lessons, live classes and a completion badge'],
          ['A cohort club', 'Created for every bootcamp, for your learners to talk'],
          ['Your verified check', 'Shown next to your name across Bluey'],
        ].map(([t, d]) => (
          <li key={t} className="rounded-[18px] border border-line bg-surface px-4 py-3">
            <strong className="text-[15px]">{t}</strong>
            <p className="text-[13px] text-ink-soft">{d}</p>
          </li>
        ))}
      </ul>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">What do you know well?</span>
          <textarea value={skills} onChange={(e) => setSkills(e.target.value)} rows={3} className={`${field} resize-none`} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">What class do you want to run?</span>
          <textarea value={idea} onChange={(e) => setIdea(e.target.value)} rows={3} className={`${field} resize-none`} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Links to your work</span>
          <input value={links} onChange={(e) => setLinks(e.target.value)} placeholder="GitHub, portfolio, past classes" className={field} />
        </label>
        {err && <p className="text-sm text-danger">{err}</p>}
        <button
          type="submit"
          disabled={!skills.trim() || !idea.trim() || state === 'sending'}
          className="min-h-[52px] rounded-2xl bg-brand text-base font-semibold text-white disabled:opacity-40"
        >
          {state === 'sending' ? 'Sending…' : 'Send application'}
        </button>
        <p className="text-xs text-ink-faint">Sent as an encrypted Nostr message. Only the Bluey team can read it.</p>
      </form>
    </div>
  );
}

export function TeachPage() {
  const me = useNDKCurrentUser();
  const tutors = useApprovedTutors();
  const { isCurator } = useTutorAdmin();

  if (!me) {
    return (
      <div className="flex flex-col gap-4 pb-8">
        <BackHeader title="Teach on Bluey" />
        <p className="px-4 text-sm text-ink-soft">Sign in to apply or create a bootcamp.</p>
      </div>
    );
  }

  const canTeach = !tutors.configured || isCurator || tutors.isApproved(me.pubkey);

  return (
    <div className="flex flex-col gap-5 pb-8">
      <BackHeader title={canTeach ? 'New bootcamp' : 'Teach on Bluey'} />
      {tutors.loading ? (
        <p className="py-8 text-center font-mono text-xs text-ink-faint">loading…</p>
      ) : canTeach ? (
        <CreateBootcamp />
      ) : (
        <Apply />
      )}
    </div>
  );
}
