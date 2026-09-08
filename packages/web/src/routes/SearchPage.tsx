import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { NoteCard } from '../components/NoteCard';
import { EngagementScope } from '../nostr/engagement';
import { isMuted, useMutes } from '../nostr/mutes';
import { isJunkNote, subjectId } from '../nostr/notes';
import { useIndexSearch, useIndexStatus } from '../nostr/useIndex';

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const indexUp = useIndexStatus();
  const mutes = useMutes();

  const query = useMemo(() => (q.trim().length >= 2 ? { q: q.trim(), limit: 50 } : null), [q]);
  const { data, loading, fromIndex } = useIndexSearch(query);
  const results = useMemo(
    () => (data ?? []).filter((e) => !isJunkNote(e) && !isMuted(e, mutes)),
    [data, mutes],
  );
  const ids = useMemo(() => results.map(subjectId), [results]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = new FormData(e.currentTarget).get('q')?.toString().trim() ?? '';
    setParams(value ? { q: value } : {});
  }

  return (
    <div>
      <header className="sticky top-0 z-10 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur">
        <form onSubmit={submit}>
          <input
            key={q}
            name="q"
            defaultValue={q}
            autoComplete="off"
            placeholder="Search notes…"
            className="w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2 text-sm outline-none focus:border-zap"
          />
        </form>
      </header>

      {!indexUp && (
        <p className="px-4 py-10 text-center text-sm text-ink-soft">
          Search needs the 1btc index service (
          <code className="font-mono text-xs">npm run dev:server</code>).
        </p>
      )}
      {indexUp && !query && (
        <p className="px-4 py-10 text-center text-sm text-ink-soft">Type at least 2 characters.</p>
      )}
      {indexUp && query && loading && (
        <p className="px-4 py-10 text-center font-mono text-xs text-ink-faint">searching…</p>
      )}
      {indexUp && query && fromIndex && data && results.length === 0 && !loading && (
        <p className="px-4 py-10 text-center text-sm text-ink-soft">No matches.</p>
      )}

      <EngagementScope ids={ids}>
        {results.map((e) => (
          <NoteCard key={e.id} event={e} />
        ))}
      </EngagementScope>
    </div>
  );
}
