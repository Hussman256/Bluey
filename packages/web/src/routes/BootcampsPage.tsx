import { useNDKCurrentUser } from '@nostr-dev-kit/react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { naddrOf } from '../nostr/bootcamps';
import { useBootcampActions, useBootcampList } from '../nostr/useBootcamps';

export function BootcampsPage() {
  const me = useNDKCurrentUser();
  const { bootcamps, loading } = useBootcampList();
  const { create } = useBootcampActions();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const { pubkey, id } = await create(title.trim(), desc.trim() || undefined);
      navigate(`/learn/${naddrOf({ kind: 30004, pubkey, identifier: id })}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-3.5 backdrop-blur">
        <span className="font-display text-lg font-bold">Bootcamps</span>
        {me && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-full bg-zap px-3.5 py-1.5 text-sm font-semibold text-bg hover:opacity-90"
          >
            {open ? 'Cancel' : 'Teach one'}
          </button>
        )}
      </header>

      {open && (
        <form onSubmit={submit} className="flex flex-col gap-2.5 border-b border-line px-4 py-4">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Bootcamp title — e.g. Ship a Nostr client in 2 weeks"
            className="rounded-xl border border-line-strong bg-surface px-3.5 py-2 text-sm outline-none focus:border-proto"
          />
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={2}
            placeholder="Who's it for and what will they build?"
            className="resize-none rounded-xl border border-line-strong bg-surface px-3.5 py-2 text-sm outline-none focus:border-proto"
          />
          <button
            type="submit"
            disabled={!title.trim() || busy}
            className="self-start rounded-full bg-ink px-4 py-2 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-40"
          >
            {busy ? 'Creating…' : 'Create bootcamp'}
          </button>
          <p className="text-xs text-ink-faint">
            Free to enrol. A cohort club is created for discussion. You add lessons next.
          </p>
        </form>
      )}

      {loading && bootcamps.length === 0 && (
        <p className="px-4 py-10 text-center font-mono text-xs text-ink-faint">loading…</p>
      )}
      {!loading && bootcamps.length === 0 && (
        <p className="px-4 py-10 text-center text-sm text-ink-soft">
          No bootcamps yet. {me ? 'Teach the first one.' : 'Sign in to create one.'}
        </p>
      )}

      <ul className="divide-y divide-line">
        {bootcamps.map((b) => (
          <li key={`${b.pubkey}:${b.id}`}>
            <Link
              to={`/learn/${naddrOf(b.addr)}`}
              className="flex gap-3 px-4 py-4 transition hover:bg-surface/40"
            >
              {b.image ? (
                <img src={b.image} alt="" className="h-16 w-24 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="grid h-16 w-24 shrink-0 place-items-center rounded-lg bg-proto-soft font-display text-xs font-bold text-proto">
                  {b.lessons.length} lesson{b.lessons.length === 1 ? '' : 's'}
                </div>
              )}
              <div className="min-w-0">
                <div className="font-display font-semibold">{b.title}</div>
                {b.description && (
                  <p className="line-clamp-2 text-sm text-ink-soft">{b.description}</p>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
