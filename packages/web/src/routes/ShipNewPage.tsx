import { SHIP_CATEGORIES, type ShipCategory } from '@bluey/shared';
import { NDKUser } from '@nostr-dev-kit/ndk';
import { useNDK, useNDKCurrentUser } from '@nostr-dev-kit/react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar, DisplayName } from '../components/primitives';
import { LS } from '../nostr/config';
import { pubkeyFrom } from '../nostr/ids';
import { CATEGORY_LABEL, type ShipDraft } from '../nostr/ships';
import { useMediaUpload } from '../nostr/useMediaUpload';
import { useMyClubs } from '../nostr/useClubs';
import { useShipActions } from '../nostr/useShips';

const EMPTY: ShipDraft = {
  title: '',
  description: '',
  category: 'app',
  tools: [],
  cover: null,
  links: [''],
  collaborators: [],
  club: null,
};

function loadDraft(): ShipDraft {
  try {
    const raw = JSON.parse(localStorage.getItem(LS.shipDraft) ?? 'null');
    if (raw && typeof raw === 'object') return { ...EMPTY, ...raw };
  } catch {
    /* ignore */
  }
  return EMPTY;
}

const STEPS = ['The work', 'Proof', 'Credit & audience'] as const;

function AudienceOption({
  label,
  hint,
  on,
  disabled = false,
  onPick,
}: {
  label: string;
  hint: string;
  on: boolean;
  disabled?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onPick}
      className={`flex flex-col items-start rounded-2xl px-4 py-3 text-left disabled:opacity-50 ${
        on ? 'border-[1.5px] border-ink' : 'border border-line-strong'
      }`}
    >
      <span className="font-semibold">{label}</span>
      <span className="text-xs text-ink-faint">{hint}</span>
    </button>
  );
}

const field =
  'w-full rounded-2xl border border-line-strong bg-surface px-4 py-3 text-[15px] outline-none placeholder:text-ink-faint focus:border-brand';

export function ShipNewPage() {
  const { ndk } = useNDK();
  const me = useNDKCurrentUser();
  const navigate = useNavigate();
  const { post } = useShipActions();
  const { upload, busy: uploading, error: uploadError } = useMediaUpload();
  const clubs = useMyClubs();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [d, setD] = useState<ShipDraft>(loadDraft);
  const [toolsText, setToolsText] = useState(() => loadDraft().tools.join(', '));
  const [who, setWho] = useState('');
  const [whoErr, setWhoErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(LS.shipDraft, JSON.stringify(d));
  }, [d]);

  const set = <K extends keyof ShipDraft>(k: K, v: ShipDraft[K]) => setD((p) => ({ ...p, [k]: v }));
  const stepOk = [d.title.trim() && d.description.trim(), true, true][step];

  if (!me) {
    return <p className="px-4 py-10 text-center text-sm text-ink-soft">Sign in to ship your work.</p>;
  }

  async function addCover(file: File) {
    const url = await upload(file);
    if (url) set('cover', url);
  }

  async function addCollaborator(e: React.FormEvent) {
    e.preventDefault();
    const raw = who.trim().replace(/^@/, '');
    if (!raw || !ndk) return;
    setWhoErr(null);
    let pk = pubkeyFrom(raw);
    if (!pk && raw.includes('@')) pk = (await NDKUser.fromNip05(raw, ndk).catch(() => undefined))?.pubkey ?? null;
    if (!pk) return setWhoErr('Use an npub or a Nostr address like name@domain.com');
    if (pk === me?.pubkey) return setWhoErr("You're already the author");
    set('collaborators', [...new Set([...d.collaborators, pk])]);
    setWho('');
  }

  async function publish() {
    setBusy(true);
    setErr(null);
    try {
      const ev = await post({
        ...d,
        tools: toolsText.split(',').map((t) => t.trim()).filter(Boolean),
        links: d.links.filter((l) => l.trim()),
      });
      localStorage.removeItem(LS.shipDraft);
      navigate(d.club ? `/clubs/${d.club}` : `/e/${ev.encode()}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not publish');
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-5rem)] flex-col bg-surface sm:min-h-0">
      <header className="sticky top-0 z-10 flex flex-col gap-3.5 border-b border-line bg-surface px-4 pb-3.5 pt-4">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => (step === 0 ? navigate(-1) : setStep(step - 1))}
            aria-label="Back"
            className="grid h-11 w-11 place-items-center rounded-2xl bg-bg"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <h1 className="flex-1 font-display text-[22px] font-extrabold">Ship it</h1>
          <span className="font-mono text-xs font-semibold text-ink-faint">
            STEP {step + 1} / {STEPS.length}
          </span>
        </div>
        <ol className="grid grid-cols-3 gap-1.5" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-col gap-1.5" aria-current={i === step ? 'step' : undefined}>
              <span className={`h-[5px] rounded-full ${i <= step ? 'bg-brand' : 'bg-line'}`} />
              <span className={`text-xs ${i === step ? 'font-semibold text-brand' : 'text-ink-faint'}`}>{s}</span>
            </li>
          ))}
        </ol>
      </header>

      <div className="flex flex-1 flex-col gap-5 px-4 py-5">
        {step === 0 && (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">What did you ship?</span>
              <input value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="Project name" className={field} />
            </label>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-semibold">Kind of work</legend>
              <div className="flex flex-wrap gap-2">
                {SHIP_CATEGORIES.map((c: ShipCategory) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={d.category === c}
                    onClick={() => set('category', c)}
                    className={`min-h-10 rounded-xl px-3.5 text-sm ${
                      d.category === c
                        ? 'border-[1.5px] border-ink bg-ink font-semibold text-white'
                        : 'border border-line-strong bg-surface hover:border-ink-faint'
                    }`}
                  >
                    {CATEGORY_LABEL[c]}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">How does it work?</span>
              <textarea
                value={d.description}
                onChange={(e) => set('description', e.target.value)}
                rows={5}
                placeholder="The problem, what you built, and what you learned"
                className={`${field} resize-none leading-relaxed`}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Built with</span>
              <input
                value={toolsText}
                onChange={(e) => setToolsText(e.target.value)}
                onBlur={() => set('tools', toolsText.split(',').map((t) => t.trim()).filter(Boolean))}
                placeholder="NWC, React, Figma…"
                className={`${field} font-mono text-sm`}
              />
              <span className="text-xs text-ink-faint">Separate with commas</span>
            </label>
          </>
        )}

        {step === 1 && (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Cover</span>
              {d.cover ? (
                <div className="relative">
                  <img src={d.cover} alt="Cover preview" className="max-h-64 w-full rounded-2xl border border-line object-cover" />
                  <button
                    type="button"
                    onClick={() => set('cover', null)}
                    className="absolute right-2 top-2 rounded-full bg-slab/80 px-3 py-1 text-xs font-semibold text-white"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex h-40 flex-col items-center justify-center gap-1 rounded-2xl border-[1.5px] border-dashed border-line-strong text-sm text-ink-soft hover:border-brand"
                >
                  <span className="font-semibold text-ink">{uploading ? 'Uploading…' : 'Add a screenshot'}</span>
                  <span className="text-xs">Shown at the top of your Ship</span>
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void addCover(f);
                  e.target.value = '';
                }}
              />
              {uploadError && <p className="text-xs text-danger">{uploadError}</p>}
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-sm font-semibold">Links</legend>
              {d.links.map((l, i) => (
                <input
                  key={i}
                  value={l}
                  onChange={(e) => set('links', d.links.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={i === 0 ? 'https:// live demo' : 'https:// repo, Figma, video…'}
                  aria-label={`Link ${i + 1}`}
                  inputMode="url"
                  className={`${field} font-mono text-sm`}
                />
              ))}
              {d.links.length < 5 && (
                <button
                  type="button"
                  onClick={() => set('links', [...d.links, ''])}
                  className="self-start text-sm font-semibold text-brand hover:underline"
                >
                  + Add another link
                </button>
              )}
            </fieldset>
          </>
        )}

        {step === 2 && (
          <>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">Who built it with you?</span>
              <form onSubmit={addCollaborator} className="flex gap-2">
                <input
                  value={who}
                  onChange={(e) => setWho(e.target.value)}
                  placeholder="npub… or name@domain.com"
                  aria-label="Collaborator"
                  className={`${field} min-w-0 flex-1 text-sm`}
                />
                <button type="submit" className="shrink-0 rounded-2xl border border-line-strong px-4 text-sm font-semibold hover:border-brand">
                  Add
                </button>
              </form>
              {whoErr && <p className="text-xs text-danger">{whoErr}</p>}
              {d.collaborators.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                  {d.collaborators.map((pk) => (
                    <li key={pk} className="flex items-center gap-2.5 rounded-xl bg-bg px-3 py-2">
                      <Avatar pubkey={pk} size={28} />
                      <DisplayName pubkey={pk} className="flex-1 text-sm" />
                      <button
                        type="button"
                        onClick={() => set('collaborators', d.collaborators.filter((x) => x !== pk))}
                        className="text-xs text-ink-faint hover:text-danger"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-ink-faint">They get notified and it shows on their profile too.</p>
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-sm font-semibold">Where it goes</legend>
              <div className="grid grid-cols-2 gap-2">
                <AudienceOption
                  label="Everyone"
                  hint="Public on Nostr"
                  on={d.club === null}
                  onPick={() => set('club', null)}
                />
                <AudienceOption
                  label="One club"
                  hint={clubs.length ? 'Members only' : 'Join a club first'}
                  on={d.club !== null}
                  disabled={clubs.length === 0}
                  onPick={() => set('club', d.club ?? clubs[0].id)}
                />
              </div>
              {d.club !== null && clubs.length > 0 && (
                <select
                  value={d.club}
                  onChange={(e) => set('club', e.target.value)}
                  aria-label="Club"
                  className={`${field} text-sm`}
                >
                  {clubs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </fieldset>

            <div className="flex items-start gap-2.5 rounded-2xl bg-bg px-4 py-3 text-[13px] leading-snug text-ink-soft">
              <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true">
                <circle cx="12" cy="12" r="10" className="fill-brand" />
                <path d="M8 12l3 3 5-6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              After you publish, people who've seen the work can vouch for it. Vouches show on your profile.
            </div>
            {err && <p className="text-sm text-danger">{err}</p>}
          </>
        )}
      </div>

      <footer className="sticky bottom-0 flex gap-2.5 border-t border-line bg-surface px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
        <Link
          to="/"
          className="grid min-h-[52px] place-items-center rounded-2xl border border-line-strong px-5 text-[15px] font-medium"
        >
          Save draft
        </Link>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            disabled={!stepOk}
            onClick={() => {
              set('tools', toolsText.split(',').map((t) => t.trim()).filter(Boolean));
              setStep(step + 1);
            }}
            className="min-h-[52px] flex-1 rounded-2xl bg-brand text-base font-semibold text-white disabled:opacity-40"
          >
            Next: {STEPS[step + 1].toLowerCase()}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || !d.title.trim() || !d.description.trim()}
            onClick={publish}
            className="min-h-[52px] flex-1 rounded-2xl bg-brand text-base font-semibold text-white disabled:opacity-40"
          >
            {busy ? 'Publishing…' : 'Publish Ship'}
          </button>
        )}
      </footer>
    </div>
  );
}
