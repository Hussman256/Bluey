import {
  NDKNip07Signer,
  NDKNip46Signer,
  NDKPrivateKeySigner,
  type NDKSigner,
} from '@nostr-dev-kit/ndk';
import { useNDK, useNDKSessionLogin } from '@nostr-dev-kit/react';
import { useState } from 'react';
import { APP_NAME, APP_TAGLINE } from '../nostr/config';

type Mode = 'choose' | 'paste' | 'created';

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
    <div className="min-h-dvh grid place-items-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="font-display text-3xl font-bold tracking-tight">
            {APP_NAME}
            <span className="text-zap">.</span>
          </div>
          <p className="mt-1 text-sm text-ink-soft">{APP_TAGLINE}</p>
        </div>

        {mode === 'choose' && (
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={withExtension}
              disabled={busy !== null}
              className="rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-bg transition hover:opacity-90 disabled:opacity-50"
            >
              {busy === 'extension' ? 'Waiting for extension…' : 'Continue with extension'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('paste');
                setErr(null);
              }}
              className="rounded-xl border border-line-strong px-4 py-3 text-sm font-semibold transition hover:border-proto hover:text-proto"
            >
              Paste an nsec or bunker link
            </button>
            <button
              type="button"
              onClick={createKey}
              className="rounded-xl px-4 py-3 text-sm font-semibold text-ink-soft transition hover:text-ink"
            >
              Create a new identity
            </button>
            {err && <p className="mt-1 text-sm text-danger">{err}</p>}
            <p className="mt-3 text-xs leading-relaxed text-ink-faint">
              1btc never sees your keys on the server, and never holds your bitcoin. An extension
              (Alby, nos2x) or a mobile signer (Amber) is the safest way in.
            </p>
          </div>
        )}

        {mode === 'paste' && (
          <div className="flex flex-col gap-2.5">
            <textarea
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              rows={3}
              placeholder="nsec1…  or  bunker://…"
              className="resize-none rounded-xl border border-line-strong bg-surface px-3.5 py-3 font-mono text-xs outline-none focus:border-proto"
            />
            <button
              type="button"
              onClick={withPasted}
              disabled={busy !== null || !secret.trim()}
              className="rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-bg transition hover:opacity-90 disabled:opacity-50"
            >
              {busy === 'paste' ? 'Signing in…' : 'Sign in'}
            </button>
            <button
              type="button"
              onClick={() => setMode('choose')}
              className="text-xs text-ink-faint hover:text-ink-soft"
            >
              ← back
            </button>
            {err && <p className="text-sm text-danger">{err}</p>}
            <p className="text-xs leading-relaxed text-ink-faint">
              Pasting an nsec stores it in this browser. A <code className="text-proto">bunker://</code>{' '}
              link keeps the key on your signer and is strongly preferred.
            </p>
          </div>
        )}

        {mode === 'created' && (
          <div className="flex flex-col gap-3">
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
              className="self-start rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold hover:border-proto hover:text-proto"
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
              className="rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-bg transition hover:opacity-90 disabled:opacity-50"
            >
              {busy === 'created' ? 'Starting…' : 'Enter 1btc'}
            </button>
            {err && <p className="text-sm text-danger">{err}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
