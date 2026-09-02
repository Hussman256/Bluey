import { nip19 } from '@nostr-dev-kit/ndk';
import { useEvent, useSubscribe } from '@nostr-dev-kit/react';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Composer } from '../components/Composer';
import { NoteCard } from '../components/NoteCard';
import { NoteContent, Avatar, DisplayName, Handle, RelativeTime } from '../components/primitives';
import { KIND } from '../nostr/kinds';

function decodeId(raw?: string): string | null {
  if (!raw) return null;
  if (/^[0-9a-f]{64}$/i.test(raw)) return raw;
  try {
    const d = nip19.decode(raw);
    if (d.type === 'note') return d.data;
    if (d.type === 'nevent') return d.data.id;
  } catch {
    /* ignore */
  }
  return null;
}

export function ThreadPage() {
  const { id } = useParams();
  const eventId = decodeId(id);
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

  return (
    <div>
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur">
        <Link to="/" className="text-ink-faint hover:text-ink">
          ←
        </Link>
        <span className="font-display font-semibold">Thread</span>
      </header>

      {!root && (
        <p className="px-4 py-10 text-center font-mono text-xs text-ink-faint">loading note…</p>
      )}

      {root && (
        <article className="border-b border-line px-4 py-4">
          <div className="flex items-center gap-3">
            <Avatar pubkey={root.pubkey} />
            <div className="text-sm">
              <DisplayName pubkey={root.pubkey} />
              <div>
                <Handle pubkey={root.pubkey} />
              </div>
            </div>
          </div>
          <div className="mt-3 text-[1.02rem]">
            <NoteContent content={root.content} />
          </div>
          <div className="mt-3 text-xs">
            <RelativeTime ts={root.created_at} />
          </div>
        </article>
      )}

      {root && <Composer replyTo={root} placeholder="Reply with your take…" />}

      {sortedReplies.map((r) => (
        <NoteCard key={r.id} event={r} />
      ))}
    </div>
  );
}
