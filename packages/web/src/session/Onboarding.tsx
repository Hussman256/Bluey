import { BOOTCAMP_TOPICS, type BootcampTopic } from '@bluey/shared';
import { NDKEvent, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import { useNDK, useNDKCurrentUser, useProfileValue } from '@nostr-dev-kit/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { NameClaim } from '../components/NameClaim';
import { Mark } from '../components/primitives';
import { TOPIC_LABEL } from '../nostr/bootcamps';
import { LS } from '../nostr/config';
import { shortNpub } from '../nostr/ids';
import { getIndexClient } from '../nostr/indexClient';
import { KIND } from '../nostr/kinds';
import { hasPasskeyFor, syncPasskeyBackups } from '../nostr/passkey';
import { publishProfile, useRawProfile, type RawProfile } from '../nostr/profile';
import { useClubActions, useClubList, useClubRosters } from '../nostr/useClubs';
import { useMediaUpload } from '../nostr/useMediaUpload';

type Step = 'profile' | 'interests' | 'people' | 'clubs' | 'name' | 'backup';

const field =
  'w-full rounded-2xl border border-line-strong bg-surface px-4 py-3 text-[15px] outline-none placeholder:text-ink-faint focus:border-brand';

/** Club words per topic, to rank club suggestions by what the person picked. */
const CLUB_WORDS: Record<BootcampTopic, string[]> = {
  bitcoin: ['bitcoin', 'btc', 'sats'],
  lightning: ['lightning', 'zap'],
  nostr: ['nostr'],
  code: ['dev', 'code', 'build', 'engineer'],
  design: ['design', 'ux', 'ui'],
  business: ['founder', 'business', 'startup'],
};

function Person({ pubkey, on, toggle }: { pubkey: string; on: boolean; toggle: () => void }) {
  const p = useProfileValue(pubkey);
  return (
    <li>
      <button
        type="button"
        aria-pressed={on}
        onClick={toggle}
        className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3 py-2.5 text-left"
      >
        {p?.picture ? (
          <img src={p.picture} alt="" className="h-11 w-11 shrink-0 rounded-full bg-sunk object-cover" />
        ) : (
          <span className="h-11 w-11 shrink-0 rounded-full bg-brand-soft" aria-hidden="true" />
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-semibold">{p?.displayName || p?.name || shortNpub(pubkey)}</span>
          <span className="line-clamp-1 text-xs text-ink-faint">{p?.about ?? ''}</span>
        </span>
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-brand bg-brand text-white' : 'border-line-strong'}`}
          aria-hidden="true"
        >
          {on && (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M6 12l4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
      </button>
    </li>
  );
}

/** First run after creating an account: profile, interests, people, clubs, name, backup. */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const { ndk } = useNDK();
  const me = useNDKCurrentUser();
  const raw = useRawProfile(me?.pubkey);
  const { upload, busy: uploading } = useMediaUpload();
  const { clubs } = useClubList();
  const rosters = useClubRosters();
  const clubActions = useClubActions();
  const picRef = useRef<HTMLInputElement>(null);

  const isPasskey = !!me && ndk?.signer instanceof NDKPrivateKeySigner && hasPasskeyFor(me.pubkey);
  const steps: Step[] = ['profile', 'interests', 'people', 'clubs', 'name', ...(isPasskey ? (['backup'] as const) : [])];

  const [step, setStep] = useState<Step>('profile');
  const [displayName, setDisplayName] = useState('');
  const [about, setAbout] = useState('');
  const [picture, setPicture] = useState('');
  const [profile, setProfile] = useState<RawProfile | null>(null);
  const [topics, setTopics] = useState<BootcampTopic[]>([]);
  const [people, setPeople] = useState<string[] | null>(null);
  const [follow, setFollow] = useState<Set<string>>(new Set());
  const [join, setJoin] = useState<Set<string>>(new Set());
  const [backup, setBackup] = useState<'saving' | 'saved' | 'failed'>('saving');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const index = steps.indexOf(step);
  const next = () => {
    setErr(null);
    setBusy(false);
    const n = steps[index + 1];
    if (n) setStep(n);
    else finish();
  };

  function finish() {
    localStorage.removeItem(LS.onboarding);
    onDone();
  }

  async function saveThen(fn: () => Promise<void>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      next();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  }

  // suggestions arrive once interests are picked
  useEffect(() => {
    if (step !== 'people' || people !== null) return;
    let live = true;
    getIndexClient()
      .request('suggest', { topics, limit: 24 })
      .then((f) => {
        if (!live) return;
        const pks = (f.pubkeys ?? []).filter((pk) => pk !== me?.pubkey);
        setPeople(pks);
        setFollow(new Set(pks.slice(0, 15)));
      })
      .catch(() => live && setPeople([]));
    return () => {
      live = false;
    };
  }, [step, people, topics, me?.pubkey]);

  useEffect(() => {
    if (step !== 'backup' || !ndk || !(ndk.signer instanceof NDKPrivateKeySigner)) return;
    let live = true;
    syncPasskeyBackups(ndk, ndk.signer).then((ok) => live && setBackup(ok ? 'saved' : 'failed'));
    return () => {
      live = false;
    };
  }, [step, ndk]);

  const clubSuggestions = useMemo(() => {
    const words = topics.flatMap((t) => CLUB_WORDS[t]);
    return clubs
      .filter((c) => c.open)
      .map((c) => {
        const text = `${c.name} ${c.about ?? ''}`.toLowerCase();
        return {
          club: c,
          score: words.filter((w) => text.includes(w)).length * 100 + (rosters.get(c.id)?.members.length ?? 0),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [clubs, rosters, topics]);

  if (!ndk || !me) return null;

  const toggle = (set: Set<string>, v: string) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    return n;
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-8 pt-6">
      <div className="flex items-center gap-3">
        <Mark size={30} />
        <ol className="flex flex-1 gap-1.5" aria-label={`Step ${index + 1} of ${steps.length}`}>
          {steps.map((s, i) => (
            <li key={s} className={`h-[5px] flex-1 rounded-full ${i <= index ? 'bg-brand' : 'bg-line'}`} />
          ))}
        </ol>
        {step !== 'profile' && step !== 'backup' && (
          <button type="button" onClick={next} className="text-sm font-semibold text-ink-faint hover:text-ink">
            Skip
          </button>
        )}
      </div>

      <div className="mt-8 flex flex-1 flex-col gap-5">
        {step === 'profile' && (
          <>
            <h1 className="font-display text-[28px] font-extrabold leading-tight">What should people call you?</h1>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => picRef.current?.click()}
                aria-label="Add a photo"
                className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-[26px] border-[1.5px] border-dashed border-line-strong bg-surface text-xs text-ink-soft"
              >
                {picture ? <img src={picture} alt="" className="h-full w-full object-cover" /> : uploading ? '…' : 'Photo'}
              </button>
              <input
                ref={picRef}
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) setPicture((await upload(f)) ?? '');
                }}
              />
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" aria-label="Your name" className={field} />
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">A line about you</span>
              <textarea
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                rows={3}
                placeholder="Learning Lightning. Building tools for creators."
                className={`${field} resize-none`}
              />
            </label>
          </>
        )}

        {step === 'interests' && (
          <>
            <h1 className="font-display text-[28px] font-extrabold leading-tight">What are you into?</h1>
            <p className="-mt-2 text-sm text-ink-soft">We'll use this to suggest people, clubs and bootcamps.</p>
            <div className="grid grid-cols-2 gap-2.5">
              {BOOTCAMP_TOPICS.map((t) => {
                const on = topics.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setTopics(on ? topics.filter((x) => x !== t) : [...topics, t])}
                    className={`min-h-[64px] rounded-2xl text-base font-semibold ${
                      on ? 'bg-brand text-white' : 'border border-line-strong bg-surface'
                    }`}
                  >
                    {TOPIC_LABEL[t]}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === 'people' && (
          <>
            <h1 className="font-display text-[28px] font-extrabold leading-tight">People worth following</h1>
            <p className="-mt-2 text-sm text-ink-soft">Trusted builders in what you picked. Tap to change.</p>
            {people === null && <p className="py-8 text-center font-mono text-xs text-ink-faint">finding people…</p>}
            {people?.length === 0 && (
              <p className="rounded-2xl bg-surface px-4 py-3 text-sm text-ink-soft">
                Suggestions aren't available right now. You can find people from Discover later.
              </p>
            )}
            <ul className="flex flex-col gap-2">
              {people?.map((pk) => (
                <Person key={pk} pubkey={pk} on={follow.has(pk)} toggle={() => setFollow(toggle(follow, pk))} />
              ))}
            </ul>
          </>
        )}

        {step === 'clubs' && (
          <>
            <h1 className="font-display text-[28px] font-extrabold leading-tight">Join a club or two</h1>
            <p className="-mt-2 text-sm text-ink-soft">Clubs are where people talk, share Ships and go live. All free.</p>
            {clubSuggestions.length === 0 && (
              <p className="rounded-2xl bg-surface px-4 py-3 text-sm text-ink-soft">No clubs to suggest yet. Start one later from the + button.</p>
            )}
            <ul className="flex flex-col gap-2">
              {clubSuggestions.map(({ club }) => {
                const on = join.has(club.id);
                const n = rosters.get(club.id)?.members.length ?? 0;
                return (
                  <li key={club.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => setJoin(toggle(join, club.id))}
                      className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left ${on ? 'border-brand bg-brand-soft' : 'border-line bg-surface'}`}
                    >
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slab font-display text-sm font-extrabold text-white" aria-hidden="true">
                        {club.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[15px] font-semibold">{club.name}</span>
                        <span className="text-xs text-ink-faint">
                          {n} member{n === 1 ? '' : 's'}
                        </span>
                      </span>
                      <span className={`text-sm font-semibold ${on ? 'text-brand' : 'text-ink-faint'}`}>{on ? 'Joining' : 'Join'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {step === 'name' && (
          <>
            <h1 className="font-display text-[28px] font-extrabold leading-tight">Claim your name</h1>
            <p className="-mt-2 text-sm text-ink-soft">One address for people to find you and send you sats.</p>
            <NameClaim base={profile ?? raw} suggested={displayName} onDone={(p) => {
                setProfile(p);
                next();
              }} doneLabel="Claim it" />
          </>
        )}

        {step === 'backup' && (
          <>
            <h1 className="font-display text-[28px] font-extrabold leading-tight">You're in</h1>
            <div className="rounded-2xl border border-line bg-surface px-4 py-3.5 text-sm leading-relaxed">
              {backup === 'saving' && 'Backing up your account…'}
              {backup === 'saved' &&
                'Your account is backed up to your passkey. Sign in on any device where that passkey is available.'}
              {backup === 'failed' && (
                <span className="text-zap-ink">
                  We couldn't reach Bluey to back up your account, so for now it only opens on this device. Save your
                  recovery key below to be safe.
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2 rounded-2xl bg-bg">
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="self-start text-sm font-semibold text-brand hover:underline"
              >
                {showKey ? 'Hide recovery key' : 'Also save a recovery key (optional)'}
              </button>
              {showKey && ndk.signer instanceof NDKPrivateKeySigner && (
                <>
                  <div className="rounded-xl border border-brand/40 bg-brand-soft px-3.5 py-3 font-mono text-xs break-all">
                    {ndk.signer.nsec}
                  </div>
                  <p className="text-xs text-ink-faint">
                    Anyone with this key controls your account. Keep it in a password manager, never in a chat.
                  </p>
                </>
              )}
            </div>
          </>
        )}

        {err && <p className="text-sm text-danger">{err}</p>}
      </div>

      {step !== 'name' && (
        <button
          type="button"
          disabled={busy || (step === 'profile' && !displayName.trim()) || (step === 'backup' && backup === 'saving')}
          onClick={() => {
            if (step === 'profile') {
              void saveThen(async () => {
                setProfile(
                  await publishProfile(ndk, raw, {
                    name: displayName.trim(),
                    display_name: displayName.trim(),
                    about: about.trim(),
                    picture,
                  }),
                );
              });
            } else if (step === 'people') {
              void saveThen(async () => {
                if (follow.size === 0) return;
                const ev = new NDKEvent(ndk);
                ev.kind = KIND.Contacts;
                ev.content = '';
                ev.tags = [...follow].map((pk) => ['p', pk]);
                await ev.publish();
              });
            } else if (step === 'clubs') {
              void saveThen(async () => {
                await Promise.allSettled([...join].map((id) => clubActions.join(id)));
              });
            } else {
              next();
            }
          }}
          className="mt-6 min-h-[56px] rounded-2xl bg-brand text-base font-semibold text-white disabled:opacity-40"
        >
          {busy
            ? 'Saving…'
            : step === 'people'
              ? follow.size
                ? `Follow ${follow.size}`
                : 'Continue'
              : step === 'clubs'
                ? join.size
                  ? `Join ${join.size}`
                  : 'Continue'
                : step === 'backup'
                  ? 'Start exploring'
                  : 'Continue'}
        </button>
      )}
    </div>
  );
}
