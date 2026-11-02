import {
  NDKNip07Signer,
  NDKNip46Signer,
  NDKPrivateKeySigner,
  type NDKSigner,
} from '@nostr-dev-kit/ndk';
import { useNDK, useNDKSessionLogin } from '@nostr-dev-kit/react';
import { useState } from 'react';
import { Mark } from '../components/primitives';
import { LS } from '../nostr/config';
import {
  createPasskeyAccount,
  PasskeyUnsupportedError,
  passkeyErrorMessage,
  passkeysAvailable,
  signInWithPasskey,
} from '../nostr/passkey';

type Mode = 'choose' | 'more' | 'paste' | 'created';

const points = [
  { t: 'Learn by building.', d: 'Bootcamps from verified tutors, with a cohort club for every one.' },
  { t: 'Proof that travels.', d: 'Your Ships, vouches and badges live on Nostr and go wherever you go.' },
  { t: 'Sats, straight to you.', d: 'Zaps land in a wallet you control. Bluey never holds your money.' },
];

function Option({
  title,
  hint,
  onClick,
  disabled,
}: {
  title: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 text-left transition hover:border-line-strong disabled:opacity-50"
    >
      <span className="flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs text-ink-faint">{hint}</span>
      </span>
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-ink-faint" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export function LoginScreen() {
  const { ndk } = useNDK();
  const login = useNDKSessionLogin();
  const canPasskey = passkeysAvailable();
  const [mode, setMode] = useState<Mode>('choose');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [secret, setSecret] = useState('');
  const [createdNsec, setCreatedNsec] = useState('');
  const [pendingSigner, setPendingSigner] = useState<NDKSigner | null>(null);
  const [ack, setAck] = useState(false);

  async function finish(signer: NDKSigner, isNew = false) {
    await signer.blockUntilReady();
    // the app shows onboarding to this pubkey only (App.tsx)
    if (isNew) localStorage.setItem(LS.onboarding, (await signer.user()).pubkey);
    await login(signer, true);
  }

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      if (e instanceof PasskeyUnsupportedError) {
        setNotice(e.message);
        createKey();
      } else {
        setErr(passkeyErrorMessage(e));
      }
    } finally {
      setBusy(null);
    }
  }

  const createWithPasskey = () =>
    run('create', async () => {
      if (!ndk) throw new Error('Still connecting. Try again in a second.');
      // a failed backup upload is retried at the end of onboarding (syncPasskeyBackups)
      const { signer } = await createPasskeyAccount(ndk);
      await finish(signer, true);
    });

  const passkeySignIn = () => run('signin', async () => finish(await signInWithPasskey()));

  const withExtension = () =>
    run('extension', async () => {
      if (!(window as unknown as { nostr?: unknown }).nostr) {
        throw new Error('No Nostr extension found. Try Alby or nos2x, or use another option.');
      }
      await finish(new NDKNip07Signer());
    });

  const withPasted = () =>
    run('paste', async () => {
      const s = secret.trim();
      if (s.startsWith('bunker://') || s.startsWith('nostrconnect://')) {
        if (!ndk) throw new Error('Still connecting. Try again in a second.');
        await finish(NDKNip46Signer.bunker(ndk, s));
      } else if (s.startsWith('nsec1') || /^[0-9a-f]{64}$/i.test(s)) {
        await finish(new NDKPrivateKeySigner(s));
      } else {
        throw new Error('Expected an nsec or a bunker:// link');
      }
    });

  function createKey() {
    const signer = NDKPrivateKeySigner.generate();
    setPendingSigner(signer);
    setCreatedNsec(signer.nsec);
    setMode('created');
    setErr(null);
  }

  const confirmCreated = () =>
    run('created', async () => {
      if (pendingSigner && ack) await finish(pendingSigner, true);
    });

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <div className="flex flex-col justify-center gap-6 px-6 pb-6 pt-12 lg:w-[560px] lg:shrink-0 lg:border-r lg:border-line lg:px-16 lg:py-0">
        <Mark size={44} />
        <h1 className="font-display text-[34px] font-extrabold leading-[1.05] tracking-tight text-balance lg:text-[2.9rem]">
          Learn, build and get paid in Bitcoin.
        </h1>
        <p className="max-w-md text-[15px] leading-relaxed text-ink-soft">
          Bluey is where builders learn in bootcamps, show what they shipped, and find their people. Your account is
          yours: it works in any Nostr app.
        </p>
        <div className="hidden flex-col gap-5 lg:flex">
          {points.map((p, i) => (
            <div key={p.t} className="flex gap-3.5">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-brand font-display text-[13px] font-bold text-white">
                {i + 1}
              </span>
              <p className="text-sm">
                <span className="font-semibold">{p.t}</span> <span className="text-ink-soft">{p.d}</span>
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-1 items-start justify-center px-6 pb-12 pt-4 lg:items-center lg:pt-12">
        <div className="w-full max-w-sm">
          {mode === 'choose' && (
            <div className="flex flex-col gap-3">
              {canPasskey ? (
                <>
                  <button
                    type="button"
                    onClick={createWithPasskey}
                    disabled={busy !== null}
                    className="min-h-[56px] rounded-2xl bg-brand text-base font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
                  >
                    {busy === 'create' ? 'Creating your account…' : 'Create your account'}
                  </button>
                  <button
                    type="button"
                    onClick={passkeySignIn}
                    disabled={busy !== null}
                    className="min-h-[56px] rounded-2xl border border-line-strong bg-surface text-base font-semibold transition hover:border-ink-faint disabled:opacity-60"
                  >
                    {busy === 'signin' ? 'Waiting for your passkey…' : 'Sign in with a passkey'}
                  </button>
                  <p className="text-center text-xs leading-relaxed text-ink-faint">
                    Uses Face ID, your fingerprint or your phone's PIN. No passwords, nothing to write down.
                  </p>
                </>
              ) : (
                <button
                  type="button"
                  onClick={createKey}
                  className="min-h-[56px] rounded-2xl bg-brand text-base font-semibold text-white"
                >
                  Create your account
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setMode('more');
                  setErr(null);
                }}
                className="mt-1 self-center text-sm font-semibold text-brand hover:underline"
              >
                More ways to sign in
              </button>
              {err && <p className="text-center text-sm text-danger">{err}</p>}
            </div>
          )}

          {mode === 'more' && (
            <div className="flex flex-col gap-2.5">
              <h2 className="mb-1 font-display text-xl font-extrabold">More ways to sign in</h2>
              <Option
                title={busy === 'extension' ? 'Waiting for extension…' : 'Browser extension'}
                hint="Alby, nos2x or another NIP-07 signer"
                onClick={withExtension}
                disabled={busy !== null}
              />
              <Option
                title="Remote signer or secret key"
                hint="A bunker:// link, or paste an nsec"
                onClick={() => {
                  setMode('paste');
                  setErr(null);
                }}
              />
              <Option
                title="Create an account with a recovery key"
                hint="For devices without passkeys. You save the key yourself."
                onClick={createKey}
              />
              <button type="button" onClick={() => setMode('choose')} className="mt-1 self-start text-xs text-ink-faint hover:text-ink-soft">
                ← Back
              </button>
              {err && <p className="text-sm text-danger">{err}</p>}
            </div>
          )}

          {mode === 'paste' && (
            <div className="flex flex-col gap-2.5">
              <h2 className="font-display text-xl font-extrabold">Remote signer or key</h2>
              <textarea
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                rows={3}
                placeholder="bunker://…  or  nsec1…"
                aria-label="Bunker link or secret key"
                className="resize-none rounded-xl border border-line-strong bg-surface px-3.5 py-3 font-mono text-xs outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={withPasted}
                disabled={busy !== null || !secret.trim()}
                className="min-h-12 rounded-xl bg-slab text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy === 'paste' ? 'Signing in…' : 'Sign in'}
              </button>
              <button type="button" onClick={() => setMode('more')} className="self-start text-xs text-ink-faint hover:text-ink-soft">
                ← Back
              </button>
              {err && <p className="text-sm text-danger">{err}</p>}
              <p className="text-xs leading-relaxed text-ink-faint">
                A <code className="text-brand-ink">bunker://</code> link keeps the key on your signer and is the safer
                choice. A pasted nsec is stored in this browser.
              </p>
            </div>
          )}

          {mode === 'created' && (
            <div className="flex flex-col gap-3">
              <h2 className="font-display text-xl font-extrabold">Save your recovery key</h2>
              {notice && <p className="rounded-xl bg-zap-soft px-3.5 py-2.5 text-xs text-zap-ink">{notice}</p>}
              <p className="text-sm text-ink-soft">
                This key is the only way back into your account. Bluey can't reset it. Save it in a password manager now.
              </p>
              <div className="rounded-xl border border-brand/40 bg-brand-soft px-3.5 py-3 font-mono text-xs break-all">
                {createdNsec}
              </div>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(createdNsec)}
                className="self-start rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold hover:border-brand hover:text-brand-ink"
              >
                Copy
              </button>
              <label className="flex items-start gap-2.5 text-xs text-ink-soft">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 accent-brand" />
                I've saved my recovery key somewhere safe.
              </label>
              <button
                type="button"
                onClick={confirmCreated}
                disabled={!ack || busy !== null}
                className="min-h-12 rounded-xl bg-brand text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy === 'created' ? 'Starting…' : 'Continue'}
              </button>
              <button type="button" onClick={() => setMode('choose')} className="self-start text-xs text-ink-faint hover:text-ink-soft">
                ← Back
              </button>
              {err && <p className="text-sm text-danger">{err}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
