import { useFollows, useNDKCurrentUser, useSubscribe } from '@nostr-dev-kit/react';
import { useEffect, useMemo, useState } from 'react';
import { useProfileBadges } from './badges';
import { getIndexClient } from './indexClient';
import { useIndexStatus } from './useIndex';
import { KIND } from './kinds';

/**
 * "Vouched" — the public, re-derivable signals shown on a profile.
 *
 * NOT a score. Just facts a newcomer needs to answer "is this person real and
 * here in good faith?" — every one of them checkable by any other client:
 *  - how many people the viewer follows also follow this person (web of trust)
 *  - sats received (zap receipts, via the index)
 *  - courses completed (NIP-58 completion badges)
 */
export interface Vouched {
  mutualFollows: number | null;
  satsReceived: number | null;
  courses: string[];
  ready: boolean;
}

export function useVouched(pubkey?: string): Vouched | null {
  const me = useNDKCurrentUser();
  const myFollows = useFollows();
  const indexUp = useIndexStatus();
  const badges = useProfileBadges(pubkey);

  // contact lists that tag this pubkey → people who follow them
  const { events: followers } = useSubscribe(
    pubkey && me?.pubkey && pubkey !== me.pubkey
      ? [{ kinds: [KIND.Contacts], '#p': [pubkey], limit: 600 }]
      : false,
    { closeOnEose: false },
    [pubkey, me?.pubkey],
  );

  const [sats, setSats] = useState<number | null>(null);
  useEffect(() => {
    if (!pubkey || !indexUp) {
      // oxlint-disable-next-line react/set-state-in-effect
      setSats(null);
      return;
    }
    let live = true;
    getIndexClient()
      .request('profile', { pubkey })
      .then((p) => {
        if (live) setSats(p?.counts?.[0]?.zapSats ?? 0);
      })
      .catch(() => {
        if (live) setSats(null);
      });
    return () => {
      live = false;
    };
  }, [pubkey, indexUp]);

  return useMemo(() => {
    if (!pubkey) return null;

    const mutualFollows =
      me?.pubkey && pubkey !== me.pubkey
        ? new Set(followers.map((e) => e.pubkey).filter((a) => myFollows.has(a))).size
        : null;

    const courses = [
      ...new Set(
        badges
          .map((b) => b.name)
          .filter((n) => / — Completed$/.test(n))
          .map((n) => n.replace(/ — Completed$/, '')),
      ),
    ];

    return {
      mutualFollows,
      satsReceived: sats,
      courses,
      ready: true,
    };
  }, [pubkey, me, followers, myFollows, badges, sats]);
}
