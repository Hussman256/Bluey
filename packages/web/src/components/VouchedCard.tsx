import type { ReactNode } from 'react';
import { useVouched } from '../nostr/reputation';

const fmtSats = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n.toLocaleString();

function Row({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span className="shrink-0 text-zap" aria-hidden="true">
        {icon}
      </span>
      <span className="text-[13px] leading-snug">{children}</span>
    </div>
  );
}

const N = ({ children }: { children: ReactNode }) => (
  <span className="font-display font-bold text-white">{children}</span>
);

export function VouchedCard({ pubkey }: { pubkey: string }) {
  const v = useVouched(pubkey);
  if (!v) return null;

  const hasMutual = v.mutualFollows != null && v.mutualFollows > 0;
  const hasSats = v.satsReceived != null && v.satsReceived > 0;
  const hasCourses = v.courses.length > 0;
  if (!hasMutual && !hasSats && !hasCourses) return null;

  return (
    <div className="mt-4 rounded-2xl bg-slab p-5 text-slab-ink">
      <div className="font-mono text-[10px] tracking-[0.06em] text-ink-faint">VOUCHED</div>
      <p className="mt-2 text-[12.5px] leading-relaxed">
        Public signals, not a rating. Any client can check these.
      </p>

      <div className="mt-4 divide-y divide-slab-line">
        {hasMutual && (
          <Row
            icon={
              <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path
                  d="M9 7a3 3 0 100-6 3 3 0 000 6zM17 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM2 20a7 7 0 0114 0M15 20c0-2.5 1.5-4.5 4-5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            }
          >
            <N>{v.mutualFollows}</N> {v.mutualFollows === 1 ? 'person' : 'people'} you follow follow
            them
          </Row>
        )}

        {hasSats && (
          <Row
            icon={
              <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="currentColor">
                <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
              </svg>
            }
          >
            <N>{fmtSats(v.satsReceived as number)}</N> sats received
          </Row>
        )}

        {hasCourses && (
          <Row
            icon={
              <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 3 2 8l10 5 10-5-10-5zM4 10v6l8 4 8-4v-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
          >
            Completed{' '}
            {v.courses.map((c, i) => (
              <span key={c}>
                {i > 0 && ', '}
                <span className="font-semibold text-white">{c}</span>
              </span>
            ))}
          </Row>
        )}
      </div>
    </div>
  );
}
