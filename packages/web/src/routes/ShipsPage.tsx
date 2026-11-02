import { useNDKCurrentUser } from '@nostr-dev-kit/react';
import { Link } from 'react-router-dom';
import { NoteCard } from '../components/NoteCard';
import { EngagementScope } from '../nostr/engagement';
import { useShipFeed } from '../nostr/useShips';

export function ShipsPage() {
  const me = useNDKCurrentUser();
  const ships = useShipFeed();

  return (
    <div>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-3.5 backdrop-blur">
        <div>
          <h1 className="font-display text-xl font-extrabold tracking-tight">Ships</h1>
          <p className="text-[11px] text-ink-faint">proof of work, vouched for by your peers</p>
        </div>
        {me && (
          <Link
            to="/ship/new"
            className="rounded-full bg-brand px-3.5 py-1.5 text-sm font-semibold text-white hover:opacity-90"
          >
            Ship
          </Link>
        )}
      </header>

      {ships.length === 0 && (
        <p className="px-4 py-10 text-center text-sm text-ink-soft">
          No ships yet. Post what you built.
        </p>
      )}
      <EngagementScope ids={ships.map((s) => s.id)}>
        {ships.map((s) => (
          <NoteCard key={s.id} event={s} />
        ))}
      </EngagementScope>
    </div>
  );
}
