import { useState } from 'react';
import { useBuilderScore } from '../nostr/reputation';

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

export function BuilderScoreCard({ pubkey }: { pubkey: string }) {
  const score = useBuilderScore(pubkey);
  const [open, setOpen] = useState(false);
  if (!score) return null;

  const rows = [
    { label: 'sats received', value: fmt(score.parts.sats.raw), n: score.parts.sats.n, w: '35%' },
    { label: 'web of trust', value: score.parts.trust.raw.toFixed(2), n: score.parts.trust.n, w: '35%' },
    { label: 'badges', value: String(score.parts.badges.raw), n: score.parts.badges.n, w: '15%' },
    { label: 'verified ships', value: String(score.parts.ships.raw), n: score.parts.ships.n, w: '15%' },
  ];

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface/50 px-3.5 py-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="flex items-baseline gap-2">
          <span className="font-display text-2xl font-bold tabular-nums">
            {score.ready ? score.total : '··'}
          </span>
          <span className="text-xs text-ink-faint">builder score</span>
        </span>
        <span className="text-xs text-ink-faint">{open ? 'hide' : 'how?'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {rows.map((r) => (
            <div key={r.label} className="text-xs">
              <div className="flex justify-between text-ink-soft">
                <span>
                  {r.label} <span className="text-ink-faint">· weight {r.w}</span>
                </span>
                <span className="font-mono tabular-nums">{r.value}</span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded bg-sunk">
                <div
                  className="h-full rounded bg-zap"
                  style={{ width: `${Math.round(r.n * 100)}%` }}
                />
              </div>
            </div>
          ))}
          <p className="pt-1 text-[11px] leading-relaxed text-ink-faint">
            This is 1btc&apos;s reading of public, verifiable signals — not a stored number. Another
            client could weight them differently.
          </p>
        </div>
      )}
    </div>
  );
}
