import { useNDKCurrentUser } from '@nostr-dev-kit/react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useClubActions, useClubList } from '../nostr/useClubs';

export function ClubsPage() {
  const me = useNDKCurrentUser();
  const { clubs, loading } = useClubList();
  const actions = useClubActions();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const id = await actions.create(name.trim(), about.trim() || undefined);
      navigate(`/clubs/${id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-3.5 backdrop-blur">
        <span className="font-display text-lg font-bold">Clubs</span>
        {me && (
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="rounded-full bg-zap px-3.5 py-1.5 text-sm font-semibold text-bg hover:opacity-90"
          >
            {creating ? 'Cancel' : 'New club'}
          </button>
        )}
      </header>

      {creating && (
        <form onSubmit={create} className="flex flex-col gap-2.5 border-b border-line px-4 py-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Club name — e.g. Rust Builders"
            className="rounded-xl border border-line-strong bg-surface px-3.5 py-2 text-sm outline-none focus:border-proto"
          />
          <textarea
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            rows={2}
            placeholder="What's this club for? (optional)"
            className="resize-none rounded-xl border border-line-strong bg-surface px-3.5 py-2 text-sm outline-none focus:border-proto"
          />
          <button
            type="submit"
            disabled={!name.trim() || busy}
            className="self-start rounded-full bg-ink px-4 py-2 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-40"
          >
            {busy ? 'Creating…' : 'Create club'}
          </button>
          <p className="text-xs text-ink-faint">
            Free and open — anyone can join. You&apos;ll be the owner.
          </p>
        </form>
      )}

      {loading && clubs.length === 0 && (
        <p className="px-4 py-10 text-center font-mono text-xs text-ink-faint">loading clubs…</p>
      )}

      {!loading && clubs.length === 0 && (
        <p className="px-4 py-10 text-center text-sm text-ink-soft">
          No clubs yet. {me ? 'Start the first one.' : 'Sign in to create one.'}
        </p>
      )}

      <ul className="divide-y divide-line">
        {clubs.map((c) => (
          <li key={c.id}>
            <Link to={`/clubs/${c.id}`} className="flex gap-3 px-4 py-3.5 transition hover:bg-surface/40">
              {c.picture ? (
                <img src={c.picture} alt="" className="h-11 w-11 rounded-xl object-cover" />
              ) : (
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-proto-soft font-display text-sm font-bold text-proto">
                  {c.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="font-display font-semibold">{c.name}</div>
                {c.about && <p className="line-clamp-1 text-sm text-ink-soft">{c.about}</p>}
                <span className="font-mono text-[11px] text-ink-faint">
                  {c.open ? 'open' : 'invite only'}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
