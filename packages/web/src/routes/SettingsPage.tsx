import { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import { useNDK, useNDKCurrentUser } from '@nostr-dev-kit/react';
import { useEffect, useState } from 'react';
import { CLUBS_RELAY } from '../nostr/clubs';
import { DEFAULT_RELAYS, INDEX_URL, loadRelayList, saveExtraRelays } from '../nostr/config';
import { npubOf } from '../nostr/ids';
import { useServiceStatus } from '../nostr/useServiceStatus';
import { useWallet } from '../wallet/WalletProvider';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-5">
      <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-ink-faint">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${ok ? 'bg-good' : 'bg-ink-faint'}`}
      aria-hidden="true"
    />
  );
}

export function SettingsPage() {
  const { ndk } = useNDK();
  const me = useNDKCurrentUser();
  const svc = useServiceStatus();
  const { wallet, status, error, balance, connectNwc, disconnect, refreshBalance } = useWallet();
  const [uri, setUri] = useState('');
  const [showNsec, setShowNsec] = useState(false);
  const [invoice, setInvoice] = useState('');
  const [amt, setAmt] = useState(1000);
  const [relays, setRelays] = useState<string[]>(loadRelayList);
  const [newRelay, setNewRelay] = useState('');
  const [relayErr, setRelayErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // repaint connection dots periodically
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 3000);
    return () => clearInterval(t);
  }, []);

  const signer = ndk?.signer;
  const nsec = signer instanceof NDKPrivateKeySigner ? signer.nsec : null;

  async function makeInvoice() {
    if (!wallet) return;
    try {
      setInvoice(await wallet.createInvoice(amt, 'Top up via 1btc'));
    } catch (e) {
      setInvoice(`error: ${e instanceof Error ? e.message : e}`);
    }
  }

  function addRelay(e: React.FormEvent) {
    e.preventDefault();
    setRelayErr(null);
    let url = newRelay.trim();
    if (!url) return;
    if (!/^wss?:\/\//.test(url)) url = `wss://${url}`;
    try {
      new URL(url);
    } catch {
      setRelayErr('not a valid relay URL');
      return;
    }
    if (relays.includes(url)) {
      setRelayErr('already added');
      return;
    }
    ndk?.pool.getRelay(url, true);
    const next = [...relays, url];
    setRelays(next);
    saveExtraRelays(next);
    setNewRelay('');
  }

  function removeRelay(url: string) {
    if (DEFAULT_RELAYS.includes(url)) return; // keep the built-in set
    ndk?.pool.removeRelay(url);
    const next = relays.filter((r) => r !== url);
    setRelays(next);
    saveExtraRelays(next);
  }

  return (
    <div>
      <header className="sticky top-0 z-10 border-b border-line bg-bg/90 px-4 py-3.5 font-display text-xl font-extrabold tracking-tight backdrop-blur">
        Settings
      </header>

      <Section title="Lightning wallet">
        {wallet ? (
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-xl border border-line px-3.5 py-3">
              <div>
                <div className="font-semibold text-good">Connected over NWC</div>
                <div className="font-mono text-xs text-ink-faint">
                  {balance != null ? `${balance.toLocaleString()} sats` : 'balance hidden'}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={refreshBalance}
                  className="rounded-lg border border-line-strong px-2.5 py-1 text-xs hover:border-zap"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={disconnect}
                  className="rounded-lg border border-line-strong px-2.5 py-1 text-xs hover:border-danger hover:text-danger"
                >
                  Disconnect
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-line px-3.5 py-3">
              <div className="mb-2 text-xs text-ink-soft">Receive sats — generate an invoice</div>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={amt}
                  min={1}
                  onChange={(e) => setAmt(Number(e.target.value))}
                  className="w-28 rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 font-mono text-xs outline-none focus:border-zap"
                />
                <button
                  type="button"
                  onClick={makeInvoice}
                  className="rounded-lg bg-slab px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                >
                  Create invoice
                </button>
              </div>
              {invoice && (
                <textarea
                  readOnly
                  value={invoice}
                  rows={3}
                  onFocus={(e) => e.currentTarget.select()}
                  className="mt-2 w-full resize-none rounded-lg border border-line bg-sunk px-2.5 py-2 font-mono text-[10px] break-all"
                />
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2.5 text-sm">
            <p className="text-ink-soft">
              1btc holds no funds. Connect a wallet you control with a{' '}
              <span className="font-mono text-zap-ink">nostr+walletconnect://</span> string — from
              Alby, Zeus, Coinos, or Alby Hub.
            </p>
            <textarea
              value={uri}
              onChange={(e) => setUri(e.target.value)}
              rows={3}
              placeholder="nostr+walletconnect://…"
              className="w-full resize-none rounded-xl border border-line-strong bg-surface px-3.5 py-3 font-mono text-xs outline-none focus:border-zap"
            />
            <button
              type="button"
              onClick={() => connectNwc(uri)}
              disabled={status === 'connecting' || !uri.trim()}
              className="rounded-xl bg-zap px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {status === 'connecting' ? 'Connecting…' : 'Connect wallet'}
            </button>
            {error && <p className="text-xs text-danger">{error}</p>}
            <p className="text-xs text-ink-faint">
              No NWC on your wallet (Muun, Phoenix, Bull Bitcoin)? You can still receive zaps at your
              Lightning address, and pay zap invoices manually — full flow lands in a later build.
            </p>
          </div>
        )}
      </Section>

      <Section title="Identity">
        {me && (
          <div className="space-y-2 text-sm">
            <div>
              <div className="text-xs text-ink-faint">Public key</div>
              <div className="font-mono text-xs break-all">{npubOf(me.pubkey)}</div>
            </div>
            {nsec && (
              <div>
                <div className="text-xs text-ink-faint">Secret key</div>
                {showNsec ? (
                  <div className="font-mono text-xs break-all text-zap">{nsec}</div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowNsec(true)}
                    className="rounded-lg border border-line-strong px-2.5 py-1 text-xs hover:border-zap hover:text-zap"
                  >
                    Reveal — back it up
                  </button>
                )}
                <p className="mt-1 text-xs text-ink-faint">
                  This browser is storing your key. Move to an extension or a bunker when you can.
                </p>
              </div>
            )}
            {!nsec && (
              <p className="text-xs text-ink-faint">
                Signing through an extension or remote signer — your key isn&apos;t in this browser. Good.
              </p>
            )}
          </div>
        )}
      </Section>

      <Section title="1btc services">
        <ul className="space-y-2 text-sm">
          <li className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Dot ok={svc.index} />
              Index — feed ranking, notifications, search
            </span>
            <span className="font-mono text-xs text-ink-faint">{INDEX_URL}</span>
          </li>
          <li className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Dot ok={svc.clubs} />
              Clubs relay — NIP-29 groups
            </span>
            <span className="font-mono text-xs text-ink-faint">{CLUBS_RELAY}</span>
          </li>
        </ul>
        <p className="mt-2 text-xs text-ink-faint">
          Set <code className="font-mono">VITE_INDEX_URL</code> / <code className="font-mono">VITE_CLUBS_RELAY</code>{' '}
          at build time to point at your own deployment.
        </p>
      </Section>

      <Section title="Relays">
        <ul className="space-y-1.5 text-sm">
          {relays.map((r) => (
            <li key={`${r}-${tick}`} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <Dot ok={!!ndk?.pool.isRelayConnected(r)} />
                <span className="truncate font-mono text-xs text-ink-soft">{r}</span>
              </span>
              {!DEFAULT_RELAYS.includes(r) && (
                <button
                  type="button"
                  onClick={() => removeRelay(r)}
                  className="shrink-0 text-xs text-ink-faint hover:text-danger"
                  aria-label={`Remove ${r}`}
                >
                  remove
                </button>
              )}
            </li>
          ))}
        </ul>
        <form onSubmit={addRelay} className="mt-3 flex gap-2">
          <input
            value={newRelay}
            onChange={(e) => setNewRelay(e.target.value)}
            placeholder="wss://relay.example.com"
            className="flex-1 rounded-lg border border-line-strong bg-surface px-3 py-1.5 font-mono text-xs outline-none focus:border-zap"
          />
          <button
            type="submit"
            disabled={!newRelay.trim()}
            className="shrink-0 rounded-lg bg-slab px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            Add
          </button>
        </form>
        {relayErr && <p className="mt-1 text-xs text-danger">{relayErr}</p>}
      </Section>
    </div>
  );
}
