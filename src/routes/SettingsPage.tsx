import { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import { useNDK, useNDKCurrentUser } from '@nostr-dev-kit/react';
import { useState } from 'react';
import { DEFAULT_RELAYS } from '../nostr/config';
import { npubOf } from '../components/primitives';
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

export function SettingsPage() {
  const { ndk } = useNDK();
  const me = useNDKCurrentUser();
  const { wallet, status, error, balance, connectNwc, disconnect, refreshBalance } = useWallet();
  const [uri, setUri] = useState('');
  const [showNsec, setShowNsec] = useState(false);
  const [invoice, setInvoice] = useState('');
  const [amt, setAmt] = useState(1000);

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

  return (
    <div>
      <header className="sticky top-0 z-10 border-b border-line bg-bg/90 px-4 py-3.5 font-display text-lg font-bold backdrop-blur">
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
                  className="rounded-lg border border-line-strong px-2.5 py-1 text-xs hover:border-proto"
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
                  className="w-28 rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 font-mono text-xs outline-none focus:border-proto"
                />
                <button
                  type="button"
                  onClick={makeInvoice}
                  className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-bg hover:opacity-90"
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
              <span className="font-mono text-proto">nostr+walletconnect://</span> string — from
              Alby, Zeus, Coinos, or Alby Hub.
            </p>
            <textarea
              value={uri}
              onChange={(e) => setUri(e.target.value)}
              rows={3}
              placeholder="nostr+walletconnect://…"
              className="w-full resize-none rounded-xl border border-line-strong bg-surface px-3.5 py-3 font-mono text-xs outline-none focus:border-proto"
            />
            <button
              type="button"
              onClick={() => connectNwc(uri)}
              disabled={status === 'connecting' || !uri.trim()}
              className="rounded-xl bg-zap px-4 py-2.5 text-sm font-semibold text-bg transition hover:opacity-90 disabled:opacity-50"
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

      <Section title="Relays">
        <ul className="space-y-1 font-mono text-xs text-ink-soft">
          {DEFAULT_RELAYS.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-ink-faint">
          Editable relay sets and a 1btc caching relay come in the next build.
        </p>
      </Section>
    </div>
  );
}
