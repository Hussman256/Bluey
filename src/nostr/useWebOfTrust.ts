import { useNDK, useFollows } from '@nostr-dev-kit/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KIND } from './kinds';

/**
 * Phase-1 web of trust.
 *
 * Trust = {people you follow} ∪ {people they follow}. That's a 2-hop closure of
 * the follow graph — enough to keep the Discover feed free of brand-new spam
 * keys, which by definition have zero inbound follows from anyone you trust.
 *
 * Later this is replaced by a PageRank score (self-computed in the caching
 * service, or queried from the Vertex DVM) so trust is graded, not binary.
 */
export function useWebOfTrust() {
  const { ndk } = useNDK();
  const follows = useFollows();
  const [trusted, setTrusted] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const ran = useRef('');

  useEffect(() => {
    if (!ndk || follows.size === 0) return;
    const key = [...follows].sort().slice(0, 5).join(',') + follows.size;
    if (ran.current === key) return;
    ran.current = key;
    setReady(false);

    const direct = [...follows];
    const set = new Set<string>(direct);

    // fan out one hop: fetch contact lists of (a sample of) the people you follow
    const sample = direct.slice(0, 200);
    const sub = ndk.subscribe(
      { kinds: [KIND.Contacts], authors: sample },
      { closeOnEose: true, groupable: true },
    );
    sub.on('event', (e) => {
      for (const t of e.tags) if (t[0] === 'p' && t[1]) set.add(t[1]);
    });
    sub.on('eose', () => {
      setTrusted(set);
      setReady(true);
    });
    return () => sub.stop();
  }, [ndk, follows]);

  return useMemo(
    () => ({
      ready,
      size: trusted.size,
      isTrusted: (pubkey: string) => follows.has(pubkey) || trusted.has(pubkey),
    }),
    [ready, trusted, follows],
  );
}
