import { KIND } from '@1btc/shared';
import { NDKEvent, type NDKFilter } from '@nostr-dev-kit/ndk';
import { useNDK } from '@nostr-dev-kit/react';
import { useEffect, useMemo, useState } from 'react';

/**
 * NIP-90 feed DVM.
 *
 * Publish a kind:5300 request tagged to the DVM, wait for its kind:6300 result
 * (a list of event refs), then fetch and render those events. This is what makes
 * feeds a *marketplace* — any third party can run an algorithm and users pick it.
 */
export function useDvmFeed(dvmPubkey: string | null) {
  const { ndk } = useNDK();
  const [refIds, setRefIds] = useState<string[] | null>(null);
  const [status, setStatus] = useState<'idle' | 'requesting' | 'ok' | 'error'>('idle');

  useEffect(() => {
    if (!ndk || !dvmPubkey) {
      setRefIds(null);
      setStatus('idle');
      return;
    }
    let live = true;
    setStatus('requesting');
    setRefIds(null);

    const req = new NDKEvent(ndk);
    req.kind = KIND.DvmFeedRequest;
    req.tags = [
      ['p', dvmPubkey],
      ['relays', ...(ndk.explicitRelayUrls ?? [])],
    ];
    req.content = '';

    const sub = ndk.subscribe(
      {
        kinds: [KIND.DvmFeedResult],
        authors: [dvmPubkey],
        since: Math.floor(Date.now() / 1000) - 5,
      } as unknown as NDKFilter,
      { closeOnEose: false },
    );
    sub.on('event', (res: NDKEvent) => {
      if (!live) return;
      try {
        const parsed: unknown = JSON.parse(res.content);
        const ids: string[] = Array.isArray(parsed)
          ? (parsed as unknown[])
              .map((t) => (Array.isArray(t) && t[0] === 'e' ? String(t[1]) : null))
              .filter((x): x is string => !!x)
          : [];
        setRefIds(ids);
        setStatus(ids.length ? 'ok' : 'error');
      } catch {
        setStatus('error');
      }
    });

    req.publish().catch(() => {
      if (live) setStatus('error');
    });
    const timeout = setTimeout(() => {
      if (live) setStatus((s) => (s === 'requesting' ? 'error' : s));
    }, 12_000);

    return () => {
      live = false;
      clearTimeout(timeout);
      sub.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ndk, dvmPubkey]);

  return { refIds, status };
}

/** Fetch the actual events for a list of ids produced by a DVM feed. */
export function useEventsByIds(ids: string[] | null) {
  const key = useMemo(() => (ids ?? []).join(','), [ids]);
  const { ndk } = useNDK();
  const [events, setEvents] = useState<NDKEvent[]>([]);

  useEffect(() => {
    if (!ndk || !ids?.length) {
      setEvents([]);
      return;
    }
    let live = true;
    const filter: NDKFilter = { ids: ids.slice(0, 120) };
    ndk.fetchEvents(filter).then((set) => {
      if (!live) return;
      const order = new Map(ids.map((id, i) => [id, i]));
      setEvents([...set].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)));
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ndk, key]);

  return events;
}
