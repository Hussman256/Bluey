import type { NDKEvent } from '@nostr-dev-kit/ndk';
import { useNDKCurrentUser } from '@nostr-dev-kit/react';
import { useMemo, useState } from 'react';
import { NoteContent } from '../nostr/content';
import { CATEGORY_LABEL, parseShip } from '../nostr/ships';
import { useShipActions, useShipVerifications } from '../nostr/useShips';
import { Avatar, DisplayName } from './primitives';

/** The "Shipped" pill shown next to the author on a Ship. */
export function ShipBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 self-center rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
        <path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2M9 15l-3-3c1-4 4-8 9-9 2 0 3 1 3 3-1 5-5 8-9 9z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Shipped
    </span>
  );
}

/** Body of a Ship note: project name, cover, write-up, tools, links, credits and vouches. */
export function ShipBody({ event }: { event: NDKEvent }) {
  const me = useNDKCurrentUser();
  const ship = useMemo(() => parseShip(event), [event]);
  const ids = useMemo(() => [ship.id], [ship.id]);
  const verifiers = useShipVerifications(ids).get(ship.id) ?? new Set<string>();
  const { verify, canVerify } = useShipActions();
  const [vouched, setVouched] = useState(false);

  const mine = me ? verifiers.has(me.pubkey) || vouched : false;
  const count = verifiers.size + (vouched && me && !verifiers.has(me.pubkey) ? 1 : 0);
  const sample = [...verifiers].slice(0, 3);

  return (
    <div className="mt-1.5 flex flex-col gap-2.5">
      {(ship.title || ship.category) && (
        <div className="flex flex-col gap-1">
          {ship.category && (
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-faint">
              {CATEGORY_LABEL[ship.category]}
            </span>
          )}
          {ship.title && (
            <h3 className="font-display text-[1.15rem] font-bold leading-snug">{ship.title}</h3>
          )}
        </div>
      )}

      {ship.cover && (
        <img
          src={ship.cover}
          alt=""
          loading="lazy"
          className="max-h-72 w-full rounded-2xl border border-line bg-sunk object-cover"
        />
      )}

      {ship.description && <NoteContent content={ship.description} />}

      {ship.tools.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Built with">
          {ship.tools.map((t) => (
            <li key={t} className="rounded-lg bg-sunk px-2 py-0.5 font-mono text-xs text-ink-soft">
              {t}
            </li>
          ))}
        </ul>
      )}

      {ship.links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {ship.links.map((l) => (
            <a
              key={l}
              href={l}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-full border border-line-strong px-2.5 py-1 font-mono text-[11px] text-brand-ink hover:border-brand"
            >
              {l.replace(/^https?:\/\//, '').slice(0, 36)}
            </a>
          ))}
        </div>
      )}

      {ship.collaborators.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
          <span>Built with</span>
          {ship.collaborators.map((pk) => (
            <span key={pk} className="inline-flex items-center gap-1">
              <Avatar pubkey={pk} size={18} />
              <DisplayName pubkey={pk} className="text-xs" />
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2.5 rounded-xl bg-bg px-3 py-2 text-[13px]">
        {sample.length > 0 && (
          <span className="flex -space-x-1.5">
            {sample.map((pk) => (
              <span key={pk} className="rounded-full ring-2 ring-bg">
                <Avatar pubkey={pk} size={20} />
              </span>
            ))}
          </span>
        )}
        <span className={`flex-1 ${count > 0 ? 'text-ink-soft' : 'text-ink-faint'}`}>
          {count > 0 ? (
            <>
              Vouched by <strong className="text-ink">{count}</strong>
              {mine && ' · including you'}
            </>
          ) : (
            'No vouches yet'
          )}
        </span>
        {canVerify(ship.pubkey) && !mine && (
          <button
            type="button"
            onClick={async () => {
              setVouched(true);
              await verify(ship).catch(() => setVouched(false));
            }}
            className="rounded-full border border-line-strong bg-surface px-3 py-1 text-xs font-semibold hover:border-good hover:text-good"
          >
            Vouch
          </button>
        )}
      </div>
    </div>
  );
}
