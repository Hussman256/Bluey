import { useFollows, useSubscribe } from '@nostr-dev-kit/react';
import { useMemo, useState } from 'react';
import { Avatar, DisplayName, RelativeTime } from '../components/primitives';
import { KIND } from '../nostr/kinds';

type Scope = 'following' | 'all';

function tag(e: { tags: string[][] }, name: string) {
  return e.tags.find((t) => t[0] === name)?.[1];
}

export function ReadsPage() {
  const follows = useFollows();
  const [scope, setScope] = useState<Scope>(follows.size > 0 ? 'following' : 'all');
  const authors = useMemo(() => [...follows].slice(0, 800), [follows]);

  const { events } = useSubscribe(
    scope === 'following' && authors.length
      ? [{ kinds: [KIND.Article], authors, limit: 40 }]
      : [{ kinds: [KIND.Article], limit: 60 }],
    { closeOnEose: false },
    [scope, authors.length],
  );

  const articles = useMemo(
    () =>
      events
        .filter((e) => e.content.trim().length > 0)
        .slice()
        .sort(
          (a, b) =>
            Number(tag(b, 'published_at') ?? b.created_at ?? 0) -
            Number(tag(a, 'published_at') ?? a.created_at ?? 0),
        )
        .slice(0, 50),
    [events],
  );

  return (
    <div>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-3 backdrop-blur">
        <span className="font-display text-xl font-extrabold tracking-tight">Reads</span>
        <div className="flex gap-1 text-xs">
          {(['following', 'all'] as Scope[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={`rounded-full px-3 py-1 font-semibold capitalize transition ${
                scope === s ? 'bg-surface text-ink' : 'text-ink-faint hover:text-ink-soft'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </header>

      <div className="divide-y divide-line">
        {articles.map((e) => {
          const title = tag(e, 'title') ?? 'Untitled';
          const summary = tag(e, 'summary');
          const image = tag(e, 'image');
          return (
            <article key={e.id} className="flex gap-4 px-4 py-4">
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center gap-2 text-xs">
                  <Avatar pubkey={e.pubkey} size={20} />
                  <DisplayName pubkey={e.pubkey} className="text-xs" />
                  <span className="text-ink-faint">·</span>
                  <RelativeTime ts={Number(tag(e, 'published_at')) || e.created_at} />
                </div>
                <h2 className="font-display text-lg font-semibold leading-snug">{title}</h2>
                {summary && (
                  <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{summary}</p>
                )}
              </div>
              {image && (
                <img
                  src={image}
                  alt=""
                  loading="lazy"
                  className="h-20 w-28 shrink-0 rounded-lg border border-line object-cover"
                />
              )}
            </article>
          );
        })}
        {articles.length === 0 && (
          <p className="px-4 py-10 text-center font-mono text-xs text-ink-faint">
            no articles yet
          </p>
        )}
      </div>
    </div>
  );
}
