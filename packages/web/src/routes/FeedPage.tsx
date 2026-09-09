import type { NDKEvent } from '@nostr-dev-kit/ndk';
import { useFollows, useNDKCurrentUser, useSubscribe } from '@nostr-dev-kit/react';
import { useEffect, useMemo, useState } from 'react';
import { Composer } from '../components/Composer';
import { NoteCard } from '../components/NoteCard';
import { LS } from '../nostr/config';
import { EngagementScope } from '../nostr/engagement';
import { BUILTIN_FEEDS, addDvmFeed, loadDvmFeeds, removeDvmFeed, type FeedRef } from '../nostr/feeds';
import { KIND } from '../nostr/kinds';
import { feedLangMode, inReadableScript, readableScripts, repostInReadableScript } from '../nostr/lang';
import { isMuted, useMutes } from '../nostr/mutes';
import { isJunkNote, isReplyNote, subjectId } from '../nostr/notes';
import { useDvmFeed, useEventsByIds } from '../nostr/useDvmFeed';
import { useIndexFeed } from '../nostr/useIndex';
import { useShipFeed } from '../nostr/useShips';
import { useWebOfTrust } from '../nostr/useWebOfTrust';

export function FeedPage() {
  const me = useNDKCurrentUser();
  const follows = useFollows();
  const wot = useWebOfTrust();
  const mutes = useMutes();

  const [langMode, setLangMode] = useState(feedLangMode);
  const [scripts, setScripts] = useState(readableScripts);
  useEffect(() => {
    const h = () => {
      setLangMode(feedLangMode());
      setScripts(readableScripts());
    };
    window.addEventListener('1btc:feed-langs', h);
    return () => window.removeEventListener('1btc:feed-langs', h);
  }, []);

  const [dvmFeeds, setDvmFeeds] = useState(loadDvmFeeds);
  const allFeeds: FeedRef[] = useMemo(() => [...BUILTIN_FEEDS, ...dvmFeeds], [dvmFeeds]);
  const [feedId, setFeedId] = useState<string>(
    () => localStorage.getItem(LS.feedTab) || 'following',
  );
  const feed = allFeeds.find((f) => f.id === feedId) ?? BUILTIN_FEEDS[0];
  const [addOpen, setAddOpen] = useState(false);
  const [dvmInput, setDvmInput] = useState('');
  const [dvmName, setDvmName] = useState('');

  function pick(id: string) {
    setFeedId(id);
    localStorage.setItem(LS.feedTab, id);
  }
  function saveDvm(e: React.FormEvent) {
    e.preventDefault();
    const f = addDvmFeed(dvmInput, dvmName);
    if (f) {
      setDvmFeeds(loadDvmFeeds());
      setDvmInput('');
      setDvmName('');
      setAddOpen(false);
      pick(f.id);
    }
  }

  const builtin = feed.kind === 'builtin' ? feed.id : null;

  // ----- built-in: following / discover via index (relay fallback) -----
  const idx = useIndexFeed({
    scope: builtin === 'discover' ? 'discover' : 'following',
    pubkey: me?.pubkey,
    limit: 80,
  });
  const useRelay = !idx.fromIndex;
  const followAuthors = useMemo(() => [...follows].slice(0, 800), [follows]);

  const { events: relayFollowing } = useSubscribe(
    useRelay && builtin === 'following' && followAuthors.length
      ? [{ kinds: [KIND.Text, KIND.Repost], authors: followAuthors, limit: 100 }]
      : false,
    { closeOnEose: false },
    [useRelay, builtin, followAuthors.length],
  );
  const { events: relayDiscover } = useSubscribe(
    (useRelay && builtin === 'discover') || builtin === 'latest'
      ? [{ kinds: [KIND.Text, KIND.Repost], limit: 200 }]
      : false,
    { closeOnEose: false },
    [useRelay, builtin],
  );

  // ----- built-in: ships -----
  const ships = useShipFeed(undefined, builtin === 'ships');

  // ----- dvm feed -----
  const dvm = useDvmFeed(feed.kind === 'dvm' ? feed.id : null);
  const dvmEvents = useEventsByIds(dvm.refIds);

  const notes = useMemo(() => {
    let source: NDKEvent[] = [];
    if (feed.kind === 'dvm') source = dvmEvents;
    else if (builtin === 'ships') source = ships;
    else if (builtin === 'latest')
      source = relayDiscover.filter((e) => !isReplyNote(e));
    else {
      const relaySrc = builtin === 'following' ? relayFollowing : relayDiscover;
      let list = (idx.fromIndex && idx.data ? idx.data : relaySrc).filter(
        (e) => !isReplyNote(e),
      );
      if (builtin === 'discover' && !idx.fromIndex) {
        // No index ranking available. Only safe cut is the viewer's own trust
        // graph — without it, relayDiscover is the raw firehose, so show nothing
        // rather than spam and point the user at Latest.
        list = wot.size > 0 ? list.filter((e) => wot.isTrusted(e.pubkey)) : [];
      }
      source = list;
    }

    const langOk = (e: NDKEvent) => {
      if (langMode === 'all' || builtin === 'following') return true;
      if (e.kind === KIND.Repost || e.kind === KIND.GenericRepost)
        return repostInReadableScript(e.content, scripts);
      return inReadableScript(e.content, scripts);
    };

    const seen = new Set<string>();
    return source
      .filter((e) => !isJunkNote(e) && !isMuted(e, mutes) && langOk(e))
      .slice()
      .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
      .filter((e) => {
        const s = subjectId(e);
        if (seen.has(s)) return false;
        seen.add(s);
        return true;
      })
      .slice(0, 120);
  }, [feed.kind, builtin, dvmEvents, ships, relayFollowing, relayDiscover, idx, wot, mutes, langMode, scripts]);

  const engagementIds = useMemo(() => notes.map(subjectId), [notes]);

  return (
    <div>
      <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
        <h1 className="px-5 pb-2 pt-4 font-display text-xl font-extrabold tracking-tight">Feed</h1>
        <div className="flex items-center gap-1.5 overflow-x-auto px-4 pb-2.5">
          {allFeeds.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => pick(f.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${
                f.id === feed.id
                  ? 'bg-slab text-white'
                  : 'text-ink-faint hover:bg-surface hover:text-ink'
              }`}
            >
              {f.name}
              {f.kind === 'dvm' && f.id === feed.id && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeDvmFeed(f.id);
                    setDvmFeeds(loadDvmFeeds());
                    pick('following');
                  }}
                  className="ml-1.5 opacity-60 hover:opacity-100"
                >
                  ×
                </span>
              )}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setAddOpen((v) => !v)}
            className="shrink-0 rounded-full border border-line-strong px-2.5 py-1.5 text-sm font-semibold text-ink-faint hover:border-zap hover:text-zap-ink"
          >
            +
          </button>
        </div>

        {addOpen && (
          <form onSubmit={saveDvm} className="flex flex-col gap-2 border-t border-line px-4 py-3">
            <p className="text-xs text-ink-faint">
              Add a NIP-90 feed DVM by its npub — any third-party algorithm.
            </p>
            <input
              value={dvmInput}
              onChange={(e) => setDvmInput(e.target.value)}
              placeholder="npub1… (the DVM)"
              className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 font-mono text-xs outline-none focus:border-zap"
            />
            <input
              value={dvmName}
              onChange={(e) => setDvmName(e.target.value)}
              placeholder="Name it"
              className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm outline-none focus:border-zap"
            />
            <button
              type="submit"
              disabled={!dvmInput.trim()}
              className="self-start rounded-full bg-slab px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
            >
              Add feed
            </button>
          </form>
        )}
      </header>

      {me && builtin !== 'ships' && <Composer />}

      <p className="px-4 py-2 text-center font-mono text-[11px] text-ink-faint">
        {feed.kind === 'dvm'
          ? dvm.status === 'requesting'
            ? 'asking the DVM…'
            : dvm.status === 'error'
              ? 'the DVM didn’t answer'
              : `${feed.name} · via NIP-90`
          : builtin === 'discover' && idx.fromIndex
            ? '1btc index · web-of-trust ranked'
            : builtin === 'ships'
              ? 'proof of work'
              : builtin === 'latest'
                ? 'everything, newest first'
                : idx.fromIndex
                  ? '1btc index'
                  : 'direct from relays'}
      </p>

      <EngagementScope ids={engagementIds}>
        {notes.map((e) => (
          <NoteCard key={e.id} event={e} />
        ))}
      </EngagementScope>

      {notes.length === 0 && (
        <div className="px-6 py-12 text-center">
          {feed.kind === 'dvm' && dvm.status === 'error' ? (
            <p className="font-mono text-xs text-ink-faint">no results</p>
          ) : builtin === 'discover' && !idx.fromIndex && wot.size === 0 ? (
            <p className="text-sm text-ink-soft">
              Discover ranks by web of trust — it fills in once you follow a few people, or
              when the 1btc index is reachable.{' '}
              <button
                type="button"
                onClick={() => pick('latest')}
                className="font-semibold text-zap-ink hover:underline"
              >
                Browse Latest
              </button>{' '}
              meanwhile.
            </p>
          ) : (
            <p className="font-mono text-xs text-ink-faint">listening…</p>
          )}
        </div>
      )}
    </div>
  );
}
