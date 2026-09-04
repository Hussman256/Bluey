import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Markdown } from '../components/Markdown';
import { DisplayName, RelativeTime } from '../components/primitives';
import { addrFromNaddr, naddrOf } from '../nostr/bootcamps';
import { useBootcamp, useLesson, useLessons } from '../nostr/useBootcamps';

export function LessonPage() {
  const { naddr } = useParams();
  const addr = naddr ? addrFromNaddr(naddr) : null;
  const lesson = useLesson(addr?.pubkey, addr?.identifier);

  const bootcamp = useBootcamp(lesson?.bootcampAddr?.pubkey, lesson?.bootcampAddr?.identifier);
  const siblings = useLessons(bootcamp);

  const idx = useMemo(
    () => siblings.findIndex((l) => l.id === lesson?.id && l.pubkey === lesson?.pubkey),
    [siblings, lesson],
  );
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;

  if (!addr) return <p className="p-8 text-center text-sm text-ink-soft">Unknown lesson.</p>;
  if (!lesson)
    return <p className="px-4 py-12 text-center font-mono text-xs text-ink-faint">loading…</p>;

  return (
    <div>
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() => history.back()}
          className="text-ink-faint hover:text-ink"
          aria-label="Back"
        >
          ←
        </button>
        <span className="truncate font-display font-semibold">{lesson.title}</span>
      </header>

      <article className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="font-display text-2xl font-bold leading-tight">{lesson.title}</h1>
        <p className="mt-2 text-xs text-ink-faint">
          <DisplayName pubkey={lesson.pubkey} className="text-xs" /> ·{' '}
          <RelativeTime ts={lesson.published_at} />
        </p>
        {lesson.image && (
          <img src={lesson.image} alt="" className="mt-4 w-full rounded-xl border border-line" />
        )}
        <div className="mt-5">
          <Markdown source={lesson.content} />
        </div>

        <nav className="mt-10 flex justify-between gap-3 border-t border-line pt-4 text-sm">
          {prev ? (
            <Link to={`/lesson/${naddrOf(prev.addr)}`} className="text-proto hover:underline">
              ← {prev.title}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              to={`/lesson/${naddrOf(next.addr)}`}
              className="text-right text-proto hover:underline"
            >
              {next.title} →
            </Link>
          ) : (
            <span />
          )}
        </nav>
        {bootcamp && (
          <Link
            to={`/learn/${naddrOf(bootcamp.addr)}`}
            className="mt-4 block text-center text-xs text-ink-faint hover:text-ink-soft"
          >
            back to {bootcamp.title}
          </Link>
        )}
      </article>
    </div>
  );
}
