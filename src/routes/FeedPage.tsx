import { useFollows, useNDKCurrentUser, useSubscribe } from '@nostr-dev-kit/react';
import { useMemo, useState } from 'react';
import { Composer } from '../components/Composer';
import { NoteCard } from '../components/NoteCard';
import { LS } from '../nostr/config';
import { EngagementScope } from '../nostr/engagement';
import { KIND } from '../nostr/kinds';
import { isJunkNote, isReplyNote, subjectId } from '../nostr/notes';
import { useWebOfTrust } from '../nostr/useWebOfTrust';

type Tab = 'following' | 'discover';

export function FeedPage() {
  const me = useNDKCurrentUser();
  const follows = useFollows();
  const wot = useWebOfTrust();
  const [tab, setTab] = useState<Tab>(
    (localStorage.getItem(LS.feedTab) as Tab) || 'following',
  );

  function pick(t: Tab) {
    setTab(t);
    localStorage.setItem(LS.feedTab, t);
  }

  const followAuthors = useMemo(() => [...follows].slice(0, 800), [follows]);

  const { events: followingEvents } = useSubscribe(
    tab === 'following' && followAuthors.length
      ? [{ kinds: [KIND.Text, KIND.Repost], authors: followAuthors, limit: 100 }]
      : false,
    { closeOnEose: false },
    [tab, followAuthors.length],
  );

  const { events: discoverEvents } = useSubscribe(
    tab === 'discover' ? [{ kinds: [KIND.Text, KIND.Repost], limit: 200 }] : false,
    { closeOnEose: false },
    [tab],
  );

  const notes = useMemo(() => {
    const raw = tab === 'following' ? followingEvents : discoverEvents;
    let list = raw.filter((e) => !isReplyNote(e) && !isJunkNote(e));
    if (tab === 'discover' && wot.size > 0) {
      list = list.filter((e) => wot.isTrusted(e.pubkey));
    }
    // de-dupe by subject so a note and its reposts don't both show
    const seen = new Set<string>();
    return list
      .slice()
      .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
      .filter((e) => {
        const s = subjectId(e);
        if (seen.has(s)) return false;
        seen.add(s);
        return true;
      })
      .slice(0, 120);
  }, [tab, followingEvents, discoverEvents, wot]);

  const engagementIds = useMemo(() => notes.map(subjectId), [notes]);

  return (
    <div>
      <header className="sticky top-0 z-10 flex border-b border-line bg-bg/90 backdrop-blur">
        {(['following', 'discover'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => pick(t)}
            className={`flex-1 py-3.5 text-sm font-semibold capitalize transition ${
              tab === t ? 'text-ink' : 'text-ink-faint hover:text-ink-soft'
            }`}
          >
            {t}
            {tab === t && <span className="mx-auto mt-2 block h-0.5 w-10 rounded bg-zap" />}
          </button>
        ))}
      </header>

      {me && <Composer />}

      {tab === 'following' && followAuthors.length === 0 && (
        <p className="px-4 py-10 text-center text-sm text-ink-soft">
          You don&apos;t follow anyone yet. Open <strong>Discover</strong> to find builders.
        </p>
      )}

      {tab === 'discover' && (
        <p className="px-4 py-2 text-center font-mono text-[11px] text-ink-faint">
          {wot.size > 0
            ? `filtered to ${wot.size.toLocaleString()} accounts in your web of trust`
            : follows.size === 0
              ? 'follow a few builders to sharpen this feed'
              : 'building your web of trust…'}
        </p>
      )}

      <EngagementScope ids={engagementIds}>
        {notes.map((e) => (
          <NoteCard key={e.id} event={e} />
        ))}
      </EngagementScope>

      {notes.length === 0 && (followAuthors.length > 0 || tab === 'discover') && (
        <p className="px-4 py-10 text-center font-mono text-xs text-ink-faint">listening…</p>
      )}
    </div>
  );
}
