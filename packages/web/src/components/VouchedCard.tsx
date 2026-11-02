import { useVouched } from '../nostr/reputation';
import { VerifiedMark } from './learn';

const fmtSats = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString();

function Fact({ n, label }: { n: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-bg p-2.5">
      <span className="font-display text-[22px] font-extrabold leading-tight">{n}</span>
      <span className="text-xs leading-snug text-ink-soft">{label}</span>
    </div>
  );
}

/**
 * "Vouched": public, re-derivable facts about a person. Not a rating; any
 * client can check every number from Nostr events.
 */
export function VouchedCard({
  pubkey,
  ships,
  vouchedShips,
}: {
  pubkey: string;
  ships: number;
  vouchedShips: number;
}) {
  const v = useVouched(pubkey);
  if (!v) return null;

  const facts: { n: string; label: string }[] = [
    { n: String(ships), label: ships ? `Ship${ships === 1 ? '' : 's'}, ${vouchedShips} vouched` : 'Ships yet' },
    { n: String(v.courses.length), label: `bootcamp${v.courses.length === 1 ? '' : 's'} finished` },
  ];
  if (v.mutualFollows != null) facts.push({ n: String(v.mutualFollows), label: 'people you follow follow them' });
  else if (v.satsReceived != null) facts.push({ n: fmtSats(v.satsReceived), label: 'sats received' });

  return (
    <section aria-label="Vouched" className="mt-4 flex flex-col gap-2.5 rounded-[20px] border border-line bg-surface p-3.5">
      <h2 className="flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
        <VerifiedMark size={16} />
        Vouched
      </h2>
      <div className={`grid gap-2 ${facts.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {facts.map((f) => (
          <Fact key={f.label} {...f} />
        ))}
      </div>
      {v.courses.length > 0 && (
        <p className="text-xs text-ink-soft">
          Finished{' '}
          {v.courses.map((c, i) => (
            <span key={c}>
              {i > 0 && ', '}
              <span className="font-semibold text-ink">{c}</span>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
