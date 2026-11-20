import type { NDKEvent } from '@nostr-dev-kit/ndk';
import { useFollows, useNDKCurrentUser, useSubscribe } from '@nostr-dev-kit/react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Composer } from '../components/Composer';
import { LoadMore } from '../components/LoadMore';
import { NoteCard } from '../components/NoteCard';
import { BoardCard, OnAirStrip } from '../components/OnAir';
import { EmptyState, Mark, NoteSkeleton, Quiet } from '../components/primitives';
import { LS } from '../nostr/config';
import { useDeletedIds } from '../nostr/deletions';
import { EngagementScope } from '../nostr/engagement';
import { BUILTIN_FEEDS, addDvmFeed, loadDvmFeeds, removeDvmFeed, type FeedRef } from '../nostr/feeds';
import { KIND } from '../nostr/kinds';
import { isSensitive } from '@bluey/shared';
import { feedLangMode, inReadableScript, readableScripts, repostInReadableScript } from '../nostr/lang';
import { isMuted, useMutes } from '../nostr/mutes';
import { isJunkNote, isReplyNote, subjectId } from '../nostr/notes';
import { useDvmFeed, useEventsByIds } from '../nostr/useDvmFeed';
import { useIndexFeed } from '../nostr/useIndex';
import { useOlderNotes } from '../nostr/useOlderNotes';
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
    window.addEventListener('bluey:feed-langs', h);
    return () => window.removeEventListener('bluey:feed-langs', h);
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

  // show placeholder rows for a moment before deciding a feed is really empty
  const [waitedFor, setWaitedFor] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setWaitedFor(feed.id), 4000);
    return () => clearTimeout(t);
  }, [feed.id]);
  const waited = waitedFor === feed.id;

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

  // ----- older posts, for the feeds that have a history to page through -----
  const pagedScope = builtin === 'following' || builtin === 'discover' ? builtin : undefined;
  const baseNotes =
    builtin === 'latest'
      ? relayDiscover
      : idx.fromIndex && idx.data
        ? idx.data
        : builtin === 'following'
          ? relayFollowing
          : relayDiscover;
  const older = useOlderNotes({
    feedKey: `${feed.id}:${me?.pubkey ?? ''}`,
    enabled: pagedScope !== undefined || builtin === 'latest',
    base: baseNotes,
    scope: builtin === 'latest' ? undefined : pagedScope,
    pubkey: me?.pubkey,
    fromIndex: builtin !== 'latest' && idx.fromIndex,
    authors: builtin === 'following' ? followAuthors : undefined,
  });

  const notes = useMemo(() => {
    let source: NDKEvent[] = [];
    if (feed.kind === 'dvm') source = dvmEvents;
    else if (builtin === 'ships') source = ships;
    else if (builtin === 'latest')
      source = [...relayDiscover, ...older.notes].filter((e) => !isReplyNote(e));
    else {
      const relaySrc = builtin === 'following' ? relayFollowing : relayDiscover;
      let list = [...(idx.fromIndex && idx.data ? idx.data : relaySrc), ...older.notes].filter(
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
      .filter(
        (e) =>
          !isJunkNote(e) &&
          !isMuted(e, mutes) &&
          langOk(e) &&
          // strangers' posts: no adult, sensitive or bridged content
          (builtin === 'following' || !isSensitive(e.tags, e.content)),
      )
      .slice()
      .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
      .filter((e) => {
        const s = subjectId(e);
        if (seen.has(s)) return false;
        seen.add(s);
        return true;
      })
      // a cap keeps a busy live feed from growing without end; once history runs out, show it all
      .slice(0, older.done ? undefined : 120 + older.notes.length);
  }, [feed.kind, builtin, dvmEvents, ships, relayFollowing, relayDiscover, older.notes, older.done, idx, wot, mutes, langMode, scripts]);

  const deleted = useDeletedIds(notes);
  const visible = useMemo(() => notes.filter((e) => !deleted.has(e.id)), [notes, deleted]);
  // the newest few hundred only: relays cap filter size, and older cards can do without live counts
  const engagementIds = useMemo(() => visible.slice(0, 300).map(subjectId), [visible]);

  return (
    <div>
      <header className="sticky top-0 z-10 border-b border-line bg-bg/95 backdrop-blur">
        <div className="flex items-center gap-1 px-4 pb-1 pt-3 sm:px-5">
          <span className="mr-1.5 sm:hidden">
            <Mark size={28} />
          </span>
          <h1 className="flex-1 font-display text-[22px] font-extrabold tracking-tight sm:text-xl">Feed</h1>
          {[
            { to: '/search', label: 'Search', d: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4' },
            { to: '/messages', label: 'Messages', d: 'M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z' },
            { to: '/notifications', label: 'Alerts', d: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4' },
          ].map((b) => (
            <Link
              key={b.to}
              to={b.to}
              aria-label={b.label}
              className="grid h-10 w-10 place-items-center rounded-full text-ink active:bg-sunk sm:hidden"
            >
              <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d={b.d} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-5 no-scrollbar overflow-x-auto px-4 sm:px-5">
          {allFeeds.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => pick(f.id)}
              className={`-mb-px shrink-0 border-b-2 py-2.5 text-[15px] font-semibold transition ${
                f.id === feed.id
                  ? 'border-brand text-ink'
                  : 'border-transparent text-ink-faint hover:text-ink'
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
            aria-label="Add a feed"
            title="Add a feed"
            className="hidden shrink-0 py-2.5 text-[15px] font-semibold text-ink-faint hover:text-brand-ink sm:block"
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
              className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 font-mono text-xs outline-none focus:border-brand"
            />
            <input
              value={dvmName}
              onChange={(e) => setDvmName(e.target.value)}
              placeholder="Name it"
              className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-sm outline-none focus:border-brand"
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

      <OnAirStrip />

      {me && builtin !== 'ships' && (
        <div className="hidden sm:block">
          <Composer />
        </div>
      )}

      {(builtin === 'following' || builtin === 'ships') && <BoardCard />}

      <EngagementScope ids={engagementIds}>
        {visible.map((e) => (
          <NoteCard key={e.id} event={e} />
        ))}
      </EngagementScope>

      {older.enabled && visible.length > 0 && <LoadMore {...older} />}

      {visible.length === 0 &&
        (builtin === 'following' && me && follows.size === 0 && waited ? (
          <EmptyState
            icon={
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M19 8v6M16 11h6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
            title="Your feed is waiting"
            action={
              <>
                <button
                  type="button"
                  onClick={() => pick('discover')}
                  className="min-h-11 rounded-full bg-brand px-5 text-sm font-semibold text-white"
                >
                  See who's posting
                </button>
                <Link
                  to="/search"
                  className="grid min-h-11 place-items-center rounded-full border border-line-strong px-5 text-sm font-semibold"
                >
                  Find people
                </Link>
              </>
            }
          >
            Follow a few people and their posts show up here.
          </EmptyState>
        ) : feed.kind === 'dvm' && dvm.status === 'error' ? (
          <Quiet>This feed didn't answer. Try again later.</Quiet>
        ) : builtin === 'discover' && !idx.fromIndex && wot.size === 0 && waited ? (
          <Quiet>Discover fills in once you follow a few people. Try again in a moment.</Quiet>
        ) : waited ? (
          <Quiet>Nothing here yet. Check back soon.</Quiet>
        ) : (
          <NoteSkeleton />
        ))}
    </div>
  );
}
