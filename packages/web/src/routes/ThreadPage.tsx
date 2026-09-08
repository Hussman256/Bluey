import { useEvent, useSubscribe } from '@nostr-dev-kit/react';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Composer } from '../components/Composer';
import { NoteCard } from '../components/NoteCard';
import { Avatar, DisplayName, Handle, RelativeTime } from '../components/primitives';
import { NoteContent } from '../nostr/content';
import { EngagementScope } from '../nostr/engagement';
import { eventIdFrom } from '../nostr/ids';
import { KIND } from '../nostr/kinds';

export function ThreadPage() {
  const { id } = useParams();
  const eventId = eventIdFrom(id);
  const root = useEvent(eventId ? { ids: [eventId] } : false, undefined, [eventId]);

  const { events: replies } = useSubscribe(
    eventId ? [{ kinds: [KIND.Text], '#e': [eventId] }] : false,
    { closeOnEose: false },
    [eventId],
  );

  const sortedReplies = useMemo(
    () =>
      replies
        .filter((r) => r.id !== eventId)
        .slice()
        .sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0)),
    [replies, eventId],
  );

  const engagementIds = useMemo(() => sortedReplies.map((r) => r.id), [sortedReplies]);

  return (
    <div>
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur">
        <Link to="/" className="text-ink-faint hover:text-ink" aria-label="Back">
          ←
        </Link>
        <span className="font-display font-semibold">Thread</span>
      </header>

      {!root && (
        <p className="px-4 py-10 text-center font-mono text-xs text-ink-faint">loading note…</p>
      )}

      {root && root.kind === KIND.Highlight && <NoteCard event={root} />}

      {root && root.kind !== KIND.Highlight && (
        <article className="border-b border-line px-4 py-4">
          <div className="flex items-center gap-3">
            <Avatar pubkey={root.pubkey} />
            <div className="min-w-0 text-sm">
              <DisplayName pubkey={root.pubkey} />
              <div>
                <Handle pubkey={root.pubkey} />
              </div>
            </div>
          </div>
          <div className="mt-3 text-[1.02rem]">
            <NoteContent
              content={root.content}
              sensitive={root.tags.some((t) => t[0] === 'content-warning')}
              sensitiveReason={root.tags.find((t) => t[0] === 'content-warning')?.[1]}
            />
          </div>
          <div className="mt-3 text-xs">
            <RelativeTime ts={root.created_at} />
          </div>
        </article>
      )}

      {root && <Composer replyTo={root} placeholder="Reply with your take…" />}

      <EngagementScope ids={engagementIds}>
        {sortedReplies.map((r) => (
          <NoteCard key={r.id} event={r} />
        ))}
      </EngagementScope>
    </div>
  );
}
