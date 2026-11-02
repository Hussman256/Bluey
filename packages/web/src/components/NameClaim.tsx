import { useNDK, useNDKCurrentUser } from '@nostr-dev-kit/react';
import { useEffect, useState } from 'react';
import { checkName, claimName, getMyName, NAME_DOMAIN } from '../nostr/accountApi';
import { publishProfile, type RawProfile } from '../nostr/profile';

const field =
  'w-full rounded-2xl border border-line-strong bg-surface px-4 py-3 text-[15px] outline-none placeholder:text-ink-faint focus:border-brand';

/**
 * Claim name@domain. It becomes the person's Nostr address (NIP-05) and, once
 * they give their own wallet's Lightning address, a Lightning address that
 * forwards every payment straight to that wallet.
 */
export function NameClaim({
  base,
  suggested = '',
  onDone,
  doneLabel = 'Save',
}: {
  base: RawProfile | null;
  suggested?: string;
  onDone: (profile: RawProfile) => void;
  doneLabel?: string;
}) {
  const { ndk } = useNDK();
  const me = useNDKCurrentUser();
  const [name, setName] = useState(suggested.toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 30));
  const [wallet, setWallet] = useState('');
  const [current, setCurrent] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'checking' | 'free' | 'taken' | 'invalid' | 'offline'>('idle');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // what they already hold, so this doubles as an edit form
  useEffect(() => {
    if (!me) return;
    let live = true;
    getMyName(me.pubkey)
      .then((r) => {
        if (!live || !r.name) return;
        setCurrent(r.name);
        setName(r.name);
        setWallet(r.lnTarget ?? '');
      })
      .catch(() => live && setStatus('offline'));
    return () => {
      live = false;
    };
  }, [me]);

  useEffect(() => {
    const n = name.trim().toLowerCase();
    if (!n || n === current) return;
    let live = true;
    const t = setTimeout(() => {
      setStatus('checking');
      checkName(n)
        .then((r) => live && setStatus(!r.valid ? 'invalid' : r.available ? 'free' : 'taken'))
        .catch(() => live && setStatus('offline'));
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [name, current]);

  const n = name.trim().toLowerCase();
  const address = `${n}@${NAME_DOMAIN}`;
  const canSave = !!n && (n === current || status === 'free') && !busy;

  async function save() {
    if (!ndk?.signer || !canSave) return;
    setBusy(true);
    setErr(null);
    try {
      const target = wallet.trim() || null;
      await claimName(ndk, ndk.signer, n, target);
      const profile = await publishProfile(ndk, base, {
        nip05: address,
        // only point zaps at the forwarding address once it has a wallet behind it
        ...(target ? { lud16: address } : {}),
      });
      onDone(profile);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save your name');
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Your Bluey name</span>
        <span className="flex items-center rounded-2xl border border-line-strong bg-surface pr-4 focus-within:border-brand">
          <input
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase())}
            placeholder="yourname"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[15px] outline-none"
          />
          <span className="shrink-0 text-[15px] text-ink-faint">@{NAME_DOMAIN}</span>
        </span>
        <span
          className={`text-xs ${
            status === 'free' || n === current ? 'text-good' : status === 'idle' || status === 'checking' ? 'text-ink-faint' : 'text-danger'
          }`}
          aria-live="polite"
        >
          {n && n === current
            ? 'This is your name'
            : status === 'checking'
              ? 'Checking…'
              : status === 'free'
                ? `${address} is yours if you want it`
                : status === 'taken'
                  ? 'That name is taken'
                  : status === 'invalid'
                    ? '2–30 letters, numbers, dots, dashes or underscores'
                    : status === 'offline'
                      ? "Names aren't available right now. You can claim one later in Settings."
                      : 'People can find you and send you sats with it'}
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Where should sats go?</span>
        <input
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          placeholder="you@walletofsatoshi.com"
          inputMode="email"
          autoCapitalize="none"
          className={field}
        />
        <span className="text-xs leading-relaxed text-ink-faint">
          Paste the Lightning address of a wallet you own (Wallet of Satoshi, Blink, Alby, Primal…). Payments to{' '}
          <strong className="text-ink-soft">{n ? address : `name@${NAME_DOMAIN}`}</strong> go straight to it. Bluey never
          holds them. You can add this later.
        </span>
      </label>

      {err && <p className="text-sm text-danger">{err}</p>}
      <button
        type="button"
        onClick={save}
        disabled={!canSave}
        className="min-h-[52px] rounded-2xl bg-brand text-base font-semibold text-white disabled:opacity-40"
      >
        {busy ? 'Saving…' : doneLabel}
      </button>
    </div>
  );
}
