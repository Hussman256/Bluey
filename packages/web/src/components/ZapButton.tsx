import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '../wallet/WalletProvider';

const QUICK = [21, 100, 500, 2100];

export function ZapButton({
  pubkey,
  eventId,
  totalSats,
  count,
}: {
  pubkey: string;
  eventId?: string;
  totalSats: number;
  count: number;
}) {
  const { wallet } = useWallet();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [flash, setFlash] = useState<'ok' | 'err' | null>(null);
  const [optimistic, setOptimistic] = useState(0);

  async function zap(sats: number) {
    if (!wallet) return;
    setSending(true);
    setFlash(null);
    const res = await wallet.sendZap({ pubkey, eventId }, sats, 'via 1btc');
    setSending(false);
    setOpen(false);
    if (res.ok) {
      setOptimistic((v) => v + sats);
      setFlash('ok');
    } else {
      setFlash('err');
    }
    setTimeout(() => setFlash(null), 2000);
  }

  const shown = totalSats + optimistic;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (wallet ? setOpen((o) => !o) : setOpen(true))}
        disabled={sending}
        className={`group inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs transition hover:bg-zap-soft ${
          flash === 'ok' ? 'text-zap' : flash === 'err' ? 'text-danger' : 'text-ink-faint hover:text-zap'
        }`}
        aria-label="Zap"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
          <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
        </svg>
        {shown > 0 && <span className="tabular-nums">{shown >= 1000 ? `${(shown / 1000).toFixed(1)}k` : shown}</span>}
        {shown === 0 && count > 0 && <span className="tabular-nums">{count}</span>}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-max rounded-xl border border-line-strong bg-surface p-2 shadow-xl">
          {wallet ? (
            <div className="flex gap-1.5">
              {QUICK.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => zap(n)}
                  disabled={sending}
                  className="rounded-lg bg-sunk px-2.5 py-1.5 font-mono text-xs hover:bg-zap-soft hover:text-zap disabled:opacity-50"
                >
                  {n}
                </button>
              ))}
            </div>
          ) : (
            <div className="max-w-[14rem] p-1 text-xs text-ink-soft">
              Connect a Lightning wallet to zap.{' '}
              <Link to="/settings" className="text-zap-ink hover:underline" onClick={() => setOpen(false)}>
                Connect →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
