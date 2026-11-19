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
import { IS_NATIVE } from '../native';

type Mode = 'choose' | 'more' | 'paste' | 'created';

const points = [
  { t: 'Learn by building.', d: 'Bootcamps from verified tutors, with a cohort club for every one.' },
  { t: 'Proof that travels.', d: 'Your Ships, vouches and badges live on Nostr and go wherever you go.' },
  { t: 'Sats, straight to you.', d: 'Zaps land in a wallet you control. Blusat never holds your money.' },
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
  const [copied, setCopied] = useState(false);

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
        throw new Error("That doesn't look like a recovery key. It should start with nsec1.");
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

  const back = (to: Mode) => (
    <button
      type="button"
      onClick={() => {
        setMode(to);
        setErr(null);
      }}
      aria-label="Back"
      className="-ml-2.5 mb-2 grid h-12 w-12 place-items-center rounded-full text-ink active:bg-sunk"
    >
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
        <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );

  const primary =
    'min-h-[56px] w-full rounded-2xl bg-brand text-base font-semibold text-white transition active:opacity-90 disabled:opacity-40';
  const secondary =
    'min-h-[56px] w-full rounded-2xl border border-line-strong bg-surface text-base font-semibold transition active:bg-sunk disabled:opacity-40';

  return (
    <div className="flex min-h-[calc(100dvh-var(--sat))] flex-col pb-[var(--sab)] lg:flex-row">
      <div
        className={`flex-col justify-center gap-6 px-6 pb-6 pt-12 lg:flex lg:w-[560px] lg:shrink-0 lg:border-r lg:border-line lg:px-16 lg:py-0 ${
          mode === 'choose' ? 'flex' : 'hidden'
        }`}
      >
        <Mark size={44} />
        <h1 className="font-display text-[34px] font-extrabold leading-[1.05] tracking-tight text-balance lg:text-[2.9rem]">
          Learn, build and get paid in Bitcoin.
        </h1>
        <p className="max-w-md text-[15px] leading-relaxed text-ink-soft">
          Blusat is where builders learn in bootcamps, show what they shipped, and find their people. Your account is
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

      <div
        className={`flex flex-1 justify-center px-6 pb-10 lg:items-center lg:pt-12 ${
          mode === 'choose' ? 'items-end pt-4' : 'items-start pt-3'
        }`}
      >
        <div className="w-full max-w-sm">
          {mode === 'choose' && (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={canPasskey ? createWithPasskey : createKey}
                disabled={busy !== null}
                className={primary}
              >
                {busy === 'create' ? 'Creating your account…' : 'Create your account'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setErr(null);
                  if (canPasskey) void passkeySignIn();
                  else setMode(IS_NATIVE ? 'paste' : 'more');
                }}
                disabled={busy !== null}
                className={secondary}
              >
                {busy === 'signin' ? 'Waiting for your passkey…' : 'I already have an account'}
              </button>
              {(canPasskey || !IS_NATIVE) && (
                <button
                  type="button"
                  onClick={() => {
                    setMode('more');
                    setErr(null);
                  }}
                  className="mt-1 min-h-10 self-center text-sm font-semibold text-ink-soft"
                >
                  Other ways to sign in
                </button>
              )}
              {err && <p className="text-center text-sm text-danger">{err}</p>}
            </div>
          )}

          {mode === 'more' && (
            <div className="flex flex-col gap-2.5">
              {back('choose')}
              <h2 className="mb-2 font-display text-[28px] font-extrabold leading-tight">Other ways to sign in</h2>
              <Option
                title="Use your recovery key"
                hint="The key you saved when you made your account"
                onClick={() => {
                  setMode('paste');
                  setErr(null);
                }}
              />
              {!IS_NATIVE && (
                <Option
                  title={busy === 'extension' ? 'Waiting for extension…' : 'Browser extension'}
                  hint="Alby, nos2x or another Nostr extension"
                  onClick={withExtension}
                  disabled={busy !== null}
                />
              )}
              {canPasskey && (
                <Option
                  title="Create an account with a recovery key"
                  hint="For devices without passkeys. You save the key yourself."
                  onClick={createKey}
                />
              )}
              {err && <p className="text-sm text-danger">{err}</p>}
            </div>
          )}

          {mode === 'paste' && (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void withPasted();
              }}
            >
              {back(IS_NATIVE && !canPasskey ? 'choose' : 'more')}
              <h2 className="font-display text-[28px] font-extrabold leading-tight">Welcome back</h2>
              <p className="-mt-1 text-[15px] leading-relaxed text-ink-soft">
                Paste the recovery key you saved when you made your account. It starts with <strong>nsec1</strong>.
              </p>
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="nsec1…"
                aria-label="Recovery key"
                autoComplete="current-password"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="min-h-[56px] rounded-2xl border border-line-strong bg-surface px-4 text-[15px] outline-none focus:border-brand"
              />
              {err && <p className="text-sm text-danger">{err}</p>}
              <button type="submit" disabled={busy !== null || !secret.trim()} className={primary}>
                {busy === 'paste' ? 'Signing in…' : 'Sign in'}
              </button>
              <p className="text-center text-xs leading-relaxed text-ink-faint">
                Your key stays on this phone. Using a signer app? Paste its bunker:// link here instead.
              </p>
            </form>
          )}

          {mode === 'created' && (
            <div className="flex flex-col gap-3">
              {back('choose')}
              <h2 className="font-display text-[28px] font-extrabold leading-tight">Save your recovery key</h2>
              {notice && <p className="rounded-xl bg-zap-soft px-3.5 py-2.5 text-xs text-zap-ink">{notice}</p>}
              <p className="-mt-1 text-[15px] leading-relaxed text-ink-soft">
                It's the only way back into your account, and Blusat can't reset it. Keep it in a password manager and
                never share it or screenshot it.
              </p>
              <div className="rounded-2xl bg-sunk px-4 py-3.5 font-mono text-[13px] leading-relaxed break-all select-all">
                {createdNsec}
              </div>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard?.writeText(createdNsec);
                  setCopied(true);
                }}
                className={secondary}
              >
                {copied ? 'Copied' : 'Copy key'}
              </button>
              <label className="flex min-h-11 items-center gap-3 text-sm text-ink-soft">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="h-5 w-5 accent-brand" />
                I've saved my recovery key somewhere safe.
              </label>
              <button type="button" onClick={confirmCreated} disabled={!ack || busy !== null} className={primary}>
                {busy === 'created' ? 'Starting…' : 'Continue'}
              </button>
              {err && <p className="text-sm text-danger">{err}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
