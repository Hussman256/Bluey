import { NDKEvent, type NDKFilter } from '@nostr-dev-kit/ndk';
import { useNDK } from '@nostr-dev-kit/react';
import { useCallback, useRef, useState } from 'react';
import { collectEvents } from './collectEvents';
import { getIndexClient } from './indexClient';
import { KIND } from './kinds';

const PAGE = 60;

interface State {
  key: string;
  notes: NDKEvent[];
  cursor: number | null;
  loading: boolean;
  done: boolean;
  error: boolean;
}

const initial = (key: string): State => ({ key, notes: [], cursor: null, loading: false, done: false, error: false });

/**
 * Pages back through a feed, from the index when it answers and from relays when
 * it doesn't, so the feed keeps working with no backend running.
 */
export function useOlderNotes({
  feedKey,
  enabled,
  base,
  scope,
  pubkey,
  fromIndex,
  authors,
}: {
  feedKey: string;
  enabled: boolean;
  /** the feed's first page, which the cursor starts below */
  base: NDKEvent[];
  scope?: 'following' | 'discover';
  pubkey?: string;
  fromIndex: boolean;
  authors?: string[];
}) {
  const { ndk } = useNDK();
  const [stored, setState] = useState<State>(() => initial(feedKey));
  // switching feeds starts over
  const state = stored.key === feedKey ? stored : initial(feedKey);
  const inFlight = useRef<string | null>(null);

  const fromRelays = useCallback(
    async (until: number): Promise<NDKEvent[]> => {
      if (!ndk) return [];
      const filter: NDKFilter = { kinds: [KIND.Text, KIND.Repost], limit: PAGE, until };
      if (authors) filter.authors = authors;
      const { events, complete } = await collectEvents(ndk, filter);
      if (!complete) throw new Error('relays did not answer');
      return events;
    },
    [ndk, authors],
  );

  const load = useCallback(async () => {
    if (!enabled || !ndk || state.done || inFlight.current === feedKey) return;
    const newest = state.cursor ?? Math.min(...base.map((e) => e.created_at ?? Infinity));
    if (!Number.isFinite(newest)) return;

    inFlight.current = feedKey;
    setState({ ...state, loading: true, error: false });
    try {
      let page: NDKEvent[] = [];
      const client = getIndexClient();
      if (fromIndex && scope && client.connected) {
        const frame = await client.request('feed', { scope, pubkey, limit: PAGE, until: newest });
        if (frame.error) throw new Error(frame.error);
        page = (frame.events ?? []).map((e) => new NDKEvent(ndk, e as never));
        // the index only keeps a few weeks; people you follow may have older posts on relays
        if (page.length === 0 && scope === 'following') page = await fromRelays(newest);
      } else {
        page = await fromRelays(newest);
      }

      const oldest = page.reduce((m, e) => Math.min(m, e.created_at ?? m), newest);
      setState((s) =>
        s.key !== feedKey && s.notes.length
          ? s
          : {
              key: feedKey,
              notes: [...state.notes, ...page],
              // step past a full page sharing one timestamp rather than asking for it forever
              cursor: oldest < newest ? oldest : newest - 1,
              loading: false,
              done: page.length === 0,
              error: false,
            },
      );
    } catch {
      setState({ ...state, loading: false, error: true });
    } finally {
      inFlight.current = null;
    }
  }, [enabled, ndk, state, base, feedKey, fromIndex, scope, pubkey, fromRelays]);

  return { enabled, notes: state.notes, loading: state.loading, done: state.done, error: state.error, load };
}
