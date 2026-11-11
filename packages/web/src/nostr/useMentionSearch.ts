import type { PersonCard } from '@bluey/shared';
import { useFollows, useNDK } from '@nostr-dev-kit/react';
import { useEffect, useRef, useState } from 'react';
import { collectEvents } from './collectEvents';
import { getIndexClient } from './indexClient';
import { KIND } from './kinds';

const MAX_RESULTS = 6;
const FOLLOW_PROFILES = 500;

const matches = (p: PersonCard, q: string) =>
  [p.name, p.displayName, p.nip05].some((v) => {
    const s = v?.toLowerCase();
    return s?.startsWith(q) || s?.includes(` ${q}`);
  });

export const personLabel = (p: PersonCard) =>
  (p.displayName || p.name || p.nip05 || p.pubkey.slice(0, 10)).replace(/\s+/g, ' ').trim();

/**
 * People matching what's typed after "@". The people you follow come first and
 * come straight from relays, so this still works with the index offline; the
 * index adds everyone else, most trusted first.
 */
export function useMentionSearch(query: string | null): PersonCard[] {
  const { ndk } = useNDK();
  const follows = useFollows();
  const [results, setResults] = useState<PersonCard[]>([]);
  const followProfiles = useRef<Promise<PersonCard[]> | null>(null);

  useEffect(() => {
    const q = query?.toLowerCase();
    if (!q || !ndk) return;

    followProfiles.current ??= follows.size
      ? collectEvents(ndk, { kinds: [KIND.Metadata], authors: [...follows].slice(0, FOLLOW_PROFILES) }).then(({ events }) =>
          events.flatMap((e) => {
            try {
              const c = JSON.parse(e.content) as Record<string, string | undefined>;
              return [
                {
                  pubkey: e.pubkey,
                  name: c.name ?? null,
                  displayName: c.display_name ?? c.displayName ?? null,
                  picture: c.picture ?? null,
                  nip05: c.nip05 ?? null,
                },
              ];
            } catch {
              return [];
            }
          }),
        )
      : Promise.resolve([]);

    let cancelled = false;
    const timer = setTimeout(async () => {
      const client = getIndexClient();
      const [mine, frame] = await Promise.all([
        followProfiles.current!,
        client.connected
          ? client.request('people', { q, limit: MAX_RESULTS }, 3000).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (cancelled) return;
      const seen = new Set<string>();
      setResults(
        [...mine.filter((p) => matches(p, q)), ...(frame?.people ?? [])]
          .filter((p) => !seen.has(p.pubkey) && !!seen.add(p.pubkey))
          .slice(0, MAX_RESULTS),
      );
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, ndk, follows]);

  return query ? results : [];
}
