import {
  NDKNip07Signer,
  NDKNip46Signer,
  NDKPrivateKeySigner,
  type NDKSigner,
} from '@nostr-dev-kit/ndk';
import { useNDK, useNDKSessionLogin } from '@nostr-dev-kit/react';
import { useState } from 'react';
import { Mark } from '../components/primitives';

type Mode = 'choose' | 'paste' | 'created';

const points = [
  {
    t: 'Non-custodial, always.',
    d: 'Connect a wallet you control — 1btc holds no funds, ever.',
  },
  {
    t: 'Free clubs and courses, no gatekeeping.',
    d: 'Nothing paywalled — no such thing as a question too basic.',
  },
  {
    t: 'Yours to take anywhere.',
    d: 'Your identity, posts and progress live on open relays — not locked inside our app.',
  },
];

export function LoginScreen() {
  const { ndk } = useNDK();
  const login = useNDKSessionLogin();
  const [mode, setMode] = useState<Mode>('choose');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [secret, setSecret] = useState('');
  const [createdNsec, setCreatedNsec] = useState('');
  const [pendingSigner, setPendingSigner] = useState<NDKSigner | null>(null);
  const [ack, setAck] = useState(false);

  async function finish(signer: NDKSigner) {
    await signer.blockUntilReady();
    await login(signer, true);
  }

  async function withExtension() {
    if (!(window as unknown as { nostr?: unknown }).nostr) {
      setErr('No Nostr extension found. Try Alby, nos2x, or paste a key below.');
      return;
    }
    setBusy('extension');
    setErr(null);
    try {
      await finish(new NDKNip07Signer());
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Extension login failed');
    } finally {
      setBusy(null);
    }
  }

  async function withPasted() {
    const s = secret.trim();
    if (!s) return;
    setBusy('paste');
    setErr(null);
    try {
      if (s.startsWith('bunker://') || s.startsWith('nostrconnect://')) {
        if (!ndk) throw new Error('NDK not ready');
        await finish(NDKNip46Signer.bunker(ndk, s));
      } else if (s.startsWith('nsec1') || /^[0-9a-f]{64}$/i.test(s)) {
        await finish(new NDKPrivateKeySigner(s));
      } else {
        throw new Error('Expected an nsec or a bunker:// link');
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not sign in with that');
    } finally {
      setBusy(null);
    }
  }

  function createKey() {
    const signer = NDKPrivateKeySigner.generate();
    setPendingSigner(signer);
    setCreatedNsec(signer.nsec);
    setMode('created');
    setErr(null);
  }

  async function confirmCreated() {
    if (!pendingSigner || !ack) return;
    setBusy('created');
    try {
      await finish(pendingSigner);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not start your session');
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* pitch */}
      <div className="flex flex-col justify-center gap-7 border-b border-line px-6 py-10 lg:w-[560px] lg:shrink-0 lg:border-b-0 lg:border-r lg:px-16 lg:py-0">
        <Mark size={36} />
        <h1 className="font-display text-3xl font-extrabold leading-[1.1] tracking-tight text-balance lg:text-[2.75rem]">
          Learn Bitcoin.
          <br />
          Find your people.
        </h1>
        <p className="max-w-md text-[15px] leading-relaxed text-ink-soft">
          A Bitcoin social and learning app on Nostr. Follow the conversation, join a club, take a
          course — every post and lesson signed by your own key.
        </p>
        <div className="hidden flex-col gap-5 lg:flex">
          {points.map((p, i) => (
            <div key={p.t} className="flex gap-3.5">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-zap font-display text-[13px] font-bold text-white">
                {i + 1}
              </span>
              <p className="text-sm">
                <span className="font-semibold">{p.t}</span>{' '}
                <span className="text-ink-soft">{p.d}</span>
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* auth */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {mode === 'choose' && (
            <>
              <h2 className="font-display text-xl font-extrabold">Sign in</h2>
              <p className="mt-1.5 mb-6 text-[13px] text-ink-soft">
                Choose how you&apos;d like to prove it&apos;s you.
              </p>
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={withExtension}
                  disabled={busy !== null}
                  className="flex items-center gap-3.5 rounded-xl bg-slab px-4 py-3.5 text-left transition hover:opacity-95 disabled:opacity-50"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-zap">
                    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="#1c1a16" strokeWidth="2.2">
                      <rect x="3" y="11" width="18" height="10" rx="2" />
                      <path d="M7 11V8a5 5 0 0110 0v3" strokeLinecap="round" />
                    </svg>
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-white">
                      {busy === 'extension' ? 'Waiting for extension…' : 'Browser extension'}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] text-slab-ink">
                      NIP-07 · Alby, nos2x
                    </span>
                  </span>
                </button>

                <div className="h-px bg-line" />

                <button
                  type="button"
                  onClick={() => {
                    setMode('paste');
                    setErr(null);
                  }}
                  className="flex items-center gap-3.5 rounded-xl px-4 py-3.5 text-left transition hover:bg-surface"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-surface">
                    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <rect x="4" y="4" width="7" height="7" />
                      <rect x="13" y="4" width="7" height="7" />
                      <rect x="4" y="13" width="7" height="7" />
                    </svg>
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">Remote signer or key</span>
                    <span className="mt-0.5 block font-mono text-[10px] text-ink-faint">
                      NIP-46 bunker link, or paste an nsec
                    </span>
                  </span>
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-ink-faint" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                <div className="h-px bg-line" />

                <button
                  type="button"
                  onClick={createKey}
                  className="flex items-center gap-3.5 rounded-xl px-4 py-3.5 text-left transition hover:bg-surface"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-surface">
                    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M4 21a8 8 0 0116 0" strokeLinecap="round" />
                    </svg>
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">New here</span>
                    <span className="mt-0.5 block font-mono text-[10px] text-ink-faint">
                      generate a keypair in your browser
                    </span>
                  </span>
                  <svg viewBox="0 0 24 24" className="h-4 w-4 text-ink-faint" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>

              {err && <p className="mt-3 text-sm text-danger">{err}</p>}
              <p className="mt-6 rounded-xl bg-surface px-4 py-3 text-xs leading-relaxed text-ink-soft">
                Your key signs everything you post. 1btc never sees it, stores it, or can act on
                your behalf.
              </p>
            </>
          )}

          {mode === 'paste' && (
            <div className="flex flex-col gap-2.5">
              <h2 className="font-display text-xl font-extrabold">Remote signer or key</h2>
              <textarea
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                rows={3}
                placeholder="bunker://…  or  nsec1…"
                className="resize-none rounded-xl border border-line-strong bg-surface px-3.5 py-3 font-mono text-xs outline-none focus:border-zap"
              />
              <button
                type="button"
                onClick={withPasted}
                disabled={busy !== null || !secret.trim()}
                className="rounded-xl bg-slab px-4 py-3 text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-50"
              >
                {busy === 'paste' ? 'Signing in…' : 'Sign in'}
              </button>
              <button
                type="button"
                onClick={() => setMode('choose')}
                className="self-start text-xs text-ink-faint hover:text-ink-soft"
              >
                ← back
              </button>
              {err && <p className="text-sm text-danger">{err}</p>}
              <p className="text-xs leading-relaxed text-ink-faint">
                A <code className="text-zap-ink">bunker://</code> link keeps the key on your signer
                and is strongly preferred. Pasting an nsec stores it in this browser.
              </p>
            </div>
          )}

          {mode === 'created' && (
            <div className="flex flex-col gap-3">
              <h2 className="font-display text-xl font-extrabold">Save your key</h2>
              <p className="text-sm text-ink-soft">
                This is your secret key. It is the <em>only</em> way back into this account — 1btc
                cannot reset it. Save it in a password manager now.
              </p>
              <div className="rounded-xl border border-zap/40 bg-zap-soft px-3.5 py-3 font-mono text-xs break-all">
                {createdNsec}
              </div>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(createdNsec)}
                className="self-start rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold transition hover:border-zap hover:text-zap-ink"
              >
                Copy
              </button>
              <label className="flex items-start gap-2.5 text-xs text-ink-soft">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                  className="mt-0.5 accent-zap"
                />
                I&apos;ve saved my secret key somewhere safe.
              </label>
              <button
                type="button"
                onClick={confirmCreated}
                disabled={!ack || busy !== null}
                className="rounded-xl bg-slab px-4 py-3 text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-50"
              >
                {busy === 'created' ? 'Starting…' : 'Enter 1btc'}
              </button>
              {err && <p className="text-sm text-danger">{err}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
