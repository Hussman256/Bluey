import { useNDKCurrentUser } from '@nostr-dev-kit/react';
import { useMemo } from 'react';
import { useProfileBadges } from './badges';
import { getIndexClient } from './indexClient';
import { useIndexStatus } from './useIndex';
import { useVerifiedShipCount } from './useShips';
import { useEffect, useState } from 'react';

/**
 * The 1btc builder score.
 *
 * NOT a number stored anywhere. It's this client's reading of four PUBLIC,
 * verifiable signals — another client could weight them differently, and that's
 * the point. Shown with its breakdown so it's never a black box.
 */
export interface BuilderScore {
  total: number; // 0..100
  parts: {
    sats: { raw: number; n: number };
    trust: { raw: number; n: number };
    badges: { raw: number; n: number };
    ships: { raw: number; n: number };
  };
  ready: boolean;
}

const WEIGHTS = { sats: 0.35, trust: 0.35, badges: 0.15, ships: 0.15 };

export function computeScore(input: {
  satsReceived: number;
  wot: number;
  badges: number;
  verifiedShips: number;
}): BuilderScore {
  const satsN = Math.min(Math.log10(1 + Math.max(0, input.satsReceived)) / 7, 1); // 10M sats → 1
  const trustN = Math.max(0, Math.min(input.wot, 1));
  const badgeN = Math.min(input.badges / 5, 1);
  const shipN = Math.min(input.verifiedShips / 8, 1);
  const total = Math.round(
    100 * (WEIGHTS.sats * satsN + WEIGHTS.trust * trustN + WEIGHTS.badges * badgeN + WEIGHTS.ships * shipN),
  );
  return {
    total,
    parts: {
      sats: { raw: input.satsReceived, n: satsN },
      trust: { raw: input.wot, n: trustN },
      badges: { raw: input.badges, n: badgeN },
      ships: { raw: input.verifiedShips, n: shipN },
    },
    ready: true,
  };
}

export function useBuilderScore(pubkey?: string): BuilderScore | null {
  const me = useNDKCurrentUser();
  const indexUp = useIndexStatus();
  const badges = useProfileBadges(pubkey);
  const verifiedShips = useVerifiedShipCount(pubkey);
  const [idx, setIdx] = useState<{ sats: number; wot: number } | null>(null);

  useEffect(() => {
    if (!pubkey || !indexUp) {
      // oxlint-disable-next-line react/set-state-in-effect
      setIdx(null);
      return;
    }
    let live = true;
    Promise.all([
      getIndexClient().request('profile', { pubkey }).catch(() => null),
      getIndexClient()
        .request('wot', { pubkey, from: me?.pubkey })
        .catch(() => null),
    ]).then(([p, w]) => {
      if (!live) return;
      const sats = p?.counts?.[0]?.zapSats ?? 0;
      const wot = w?.score ?? 0;
      setIdx({ sats, wot });
    });
    return () => {
      live = false;
    };
  }, [pubkey, indexUp, me?.pubkey]);

  return useMemo(() => {
    if (!pubkey) return null;
    if (!idx) return { ...computeScore({ satsReceived: 0, wot: 0, badges: 0, verifiedShips: 0 }), ready: false };
    return computeScore({
      satsReceived: idx.sats,
      wot: idx.wot,
      badges: badges.length,
      verifiedShips,
    });
  }, [pubkey, idx, badges.length, verifiedShips]);
}
