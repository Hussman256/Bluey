import type {
  EngagementCount,
  FeedParams,
  NostrEventLike,
  NotificationItem,
  NotificationsParams,
  RequestMethod,
  SearchParams,
} from '@1btc/shared';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { useNDK } from '@nostr-dev-kit/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getIndexClient } from './indexClient';

export function useIndexStatus(): boolean {
  const [up, setUp] = useState(() => getIndexClient().connected);
  useEffect(() => {
    const off = getIndexClient().onStatus(setUp);
    return () => {
      off();
    };
  }, []);
  return up;
}

type QueryState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** true when the index answered; false means callers should use their relay fallback */
  fromIndex: boolean;
  refetch: () => void;
};

function useIndexQuery<T>(
  method: RequestMethod,
  params: unknown,
  select: (frame: {
    events?: NostrEventLike[];
    counts?: EngagementCount[];
    notifications?: NotificationItem[];
    score?: number;
  }) => T,
  deps: unknown[],
): QueryState<T> {
  const up = useIndexStatus();
  const [state, setState] = useState<Omit<QueryState<T>, 'refetch'>>({
    data: null,
    loading: true,
    error: null,
    fromIndex: false,
  });
  const tick = useRef(0);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const selectRef = useRef(select);
  selectRef.current = select;

  const run = useCallback(() => {
    const myTick = ++tick.current;
    if (!getIndexClient().connected) {
      setState({ data: null, loading: false, error: 'index offline', fromIndex: false });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    getIndexClient()
      .request(method, paramsRef.current as never)
      .then((frame) => {
        if (myTick !== tick.current) return;
        if (frame.error) {
          setState({ data: null, loading: false, error: frame.error, fromIndex: false });
          return;
        }
        setState({ data: selectRef.current(frame), loading: false, error: null, fromIndex: true });
      })
      .catch((e) => {
        if (myTick !== tick.current) return;
        setState({
          data: null,
          loading: false,
          error: e instanceof Error ? e.message : 'index unavailable',
          fromIndex: false,
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // re-run on param changes and whenever the index (re)connects
  useEffect(run, [run, up]);

  return { ...state, refetch: run };
}

const toNDK = (ndk: ReturnType<typeof useNDK>['ndk'], evs: NostrEventLike[] = []) =>
  ndk ? evs.map((e) => new NDKEvent(ndk, e as never)) : [];

export function useIndexFeed(params: Omit<FeedParams, 'scope'> & { scope: FeedParams['scope'] }) {
  const { ndk } = useNDK();
  return useIndexQuery(
    'feed',
    params,
    (f) => toNDK(ndk, f.events),
    [params.scope, params.pubkey, params.until, ndk],
  );
}

export function useIndexNotifications(params: NotificationsParams) {
  return useIndexQuery(
    'notifications',
    params,
    (f) => f.notifications ?? [],
    [params.pubkey, params.since],
  );
}

export function useIndexSearch(params: SearchParams | null) {
  const { ndk } = useNDK();
  return useIndexQuery(
    'search',
    params ?? { q: '' },
    (f) => (params ? toNDK(ndk, f.events) : []),
    [params?.q, ndk],
  );
}
