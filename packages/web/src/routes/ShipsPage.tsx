import { useNDKCurrentUser } from '@nostr-dev-kit/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { NoteContent } from '../nostr/content';
import { Avatar, DisplayName, RelativeTime } from '../components/primitives';
import { parseShip } from '../nostr/ships';
import { useShipActions, useShipFeed, useShipVerifications } from '../nostr/useShips';
import type { NDKEvent } from '@nostr-dev-kit/ndk';

function ShipComposer({ onDone }: { onDone: () => void }) {
  const { post } = useShipActions();
  const [text, setText] = useState('');
  const [links, setLinks] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await post(
        text.trim(),
        links
          .split(/[\s,]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      );
      setText('');
      setLinks('');
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2.5 border-b border-line px-4 py-4">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="What did you ship? What does it do?"
        className="resize-none rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-zap"
      />
      <input
        value={links}
        onChange={(e) => setLinks(e.target.value)}
        placeholder="Repo / demo links (space-separated)"
        className="rounded-xl border border-line-strong bg-surface px-3.5 py-2 font-mono text-xs outline-none focus:border-zap"
      />
      <button
        type="submit"
        disabled={!text.trim() || busy}
        className="self-start rounded-full bg-zap px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
      >
        {busy ? 'Shipping…' : 'Ship it'}
      </button>
    </form>
  );
}

function ShipCard({
  event,
  verifiers,
}: {
  event: NDKEvent;
  verifiers: Set<string>;
}) {
  const me = useNDKCurrentUser();
  const { verify, canVerify } = useShipActions();
  const ship = useMemo(() => parseShip(event), [event]);
  const [verified, setVerified] = useState(false);

  const alreadyVerified = me ? verifiers.has(me.pubkey) : false;
  const count = verifiers.size + (verified && !alreadyVerified ? 1 : 0);

  return (
    <article className="border-b border-line px-4 py-3.5">
      <div className="flex gap-3">
        <Avatar pubkey={ship.pubkey} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5 text-sm">
            <DisplayName pubkey={ship.pubkey} />
            <span className="rounded-full bg-zap-soft px-1.5 py-0.5 font-mono text-[10px] uppercase text-zap-ink">
              ship
            </span>
            <span className="text-ink-faint">·</span>
            <Link to={`/e/${event.encode()}`} className="hover:underline">
              <RelativeTime ts={ship.created_at} />
            </Link>
          </div>
          <div className="mt-1">
            <NoteContent content={ship.content} />
          </div>
          {ship.links.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {ship.links.map((l) => (
                <a
                  key={l}
                  href={l}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="rounded-full border border-line-strong px-2.5 py-1 font-mono text-[11px] text-zap-ink hover:border-zap"
                >
                  {l.replace(/^https?:\/\//, '').slice(0, 36)}
                </a>
              ))}
            </div>
          )}
          <div className="mt-2.5 flex items-center gap-3 text-xs">
            <span className={count > 0 ? 'text-good' : 'text-ink-faint'}>
              {count > 0 ? `✓ verified by ${count}` : 'unverified'}
            </span>
            {canVerify(ship.pubkey) && !alreadyVerified && !verified && (
              <button
                type="button"
                onClick={async () => {
                  setVerified(true);
                  await verify(ship);
                }}
                className="rounded-full border border-line-strong px-2.5 py-1 font-semibold hover:border-good hover:text-good"
              >
                Verify this work
              </button>
            )}
            {(alreadyVerified || verified) && canVerify(ship.pubkey) && (
              <span className="text-good">you verified this ✓</span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export function ShipsPage() {
  const me = useNDKCurrentUser();
  const [composing, setComposing] = useState(false);
  const ships = useShipFeed();
  const ids = useMemo(() => ships.map((s) => s.id), [ships]);
  const verifs = useShipVerifications(ids);

  return (
    <div>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-3.5 backdrop-blur">
        <div>
          <span className="font-display text-xl font-extrabold tracking-tight">Ships</span>
          <p className="text-[11px] text-ink-faint">proof of work — verified by your peers</p>
        </div>
        {me && (
          <button
            type="button"
            onClick={() => setComposing((v) => !v)}
            className="rounded-full bg-zap px-3.5 py-1.5 text-sm font-semibold text-white hover:opacity-90"
          >
            {composing ? 'Cancel' : 'Ship'}
          </button>
        )}
      </header>

      {composing && <ShipComposer onDone={() => setComposing(false)} />}

      {ships.length === 0 && (
        <p className="px-4 py-10 text-center text-sm text-ink-soft">
          No ships yet. Post what you built.
        </p>
      )}
      {ships.map((s) => (
        <ShipCard key={s.id} event={s} verifiers={verifs.get(s.id) ?? new Set()} />
      ))}
    </div>
  );
}
