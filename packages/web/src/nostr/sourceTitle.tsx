import { useSubscribe } from '@nostr-dev-kit/react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { naddrOf, type Addr } from './bootcamps';
import { KIND } from './kinds';

/**
 * Resolve the title of a highlight's source (a kind:30023 lesson / article) and
 * render it as a link back to the lesson. Falls back to a plain label while the
 * article loads or if it can't be found.
 */
export function SourceTitle({ source }: { source: Addr | null }) {
  const article = source?.kind === KIND.Article;
  const { events } = useSubscribe(
    article ? [{ kinds: [KIND.Article], authors: [source!.pubkey], '#d': [source!.identifier] }] : false,
    { closeOnEose: true },
    [source && `${source.pubkey}:${source.identifier}`],
  );
  const title = useMemo(() => {
    const e = events[0];
    return e?.tags.find((t) => t[0] === 'title')?.[1] ?? e?.tags.find((t) => t[0] === 'd')?.[1];
  }, [events]);

  if (!source) return <span className="text-ink-faint">a highlight</span>;
  if (!article) return <span className="text-ink-faint">a source</span>;

  return (
    <Link to={`/lesson/${naddrOf(source)}`} className="text-zap-ink hover:underline">
      {title ?? 'the lesson'}
    </Link>
  );
}
