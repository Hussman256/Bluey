import { KIND, SHIP_LABEL_NS, TAG } from '@1btc/shared';
import type { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import { useNDK, useNDKCurrentUser, useSubscribe } from '@nostr-dev-kit/react';
import { useCallback, useMemo } from 'react';
import { isJunkNote } from './notes';
import { shipEvent, verifiersOf, verifyShipEvent } from './ships';
import { useWebOfTrust } from './useWebOfTrust';

/** Ship notes (kind 1 tagged proof-of-work), newest first, WoT-filtered. */
export function useShipFeed(scopePubkey?: string, enabled = true) {
  const wot = useWebOfTrust();
  const { events } = useSubscribe(
    enabled
      ? [
          scopePubkey
            ? { kinds: [KIND.Text], authors: [scopePubkey], '#t': [TAG.ship], limit: 100 }
            : { kinds: [KIND.Text], '#t': [TAG.ship], limit: 200 },
        ]
      : false,
    { closeOnEose: false },
    [scopePubkey, enabled],
  );

  return useMemo(() => {
    let list = events.filter((e) => !isJunkNote(e));
    if (!scopePubkey && wot.size > 0) list = list.filter((e) => wot.isTrusted(e.pubkey));
    return list
      .slice()
      .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
      .slice(0, 120);
  }, [events, wot, scopePubkey]);
}

/** Verification labels for a set of ship ids. */
export function useShipVerifications(shipIds: string[]) {
  const key = useMemo(() => shipIds.slice().sort().join(','), [shipIds]);
  const { events } = useSubscribe(
    shipIds.length
      ? ([{ kinds: [KIND.Label], '#e': shipIds, '#L': [SHIP_LABEL_NS] }] as unknown as NDKFilter[])
      : false,
    { closeOnEose: false },
    [key],
  );

  return useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const id of shipIds) map.set(id, verifiersOf(events, id));
    return map;
  }, [events, shipIds]);
}

/** Count of this pubkey's ships that carry ≥1 verification. */
export function useVerifiedShipCount(pubkey?: string): number {
  const ships = useShipFeed(pubkey);
  const ids = useMemo(() => ships.map((s) => s.id), [ships]);
  const verifs = useShipVerifications(ids);
  return useMemo(
    () => ids.filter((id) => (verifs.get(id)?.size ?? 0) > 0).length,
    [ids, verifs],
  );
}

export function useShipActions() {
  const { ndk } = useNDK();
  const me = useNDKCurrentUser();

  const post = useCallback(
    async (description: string, links: string[]) => {
      if (!ndk) throw new Error('not ready');
      await shipEvent(ndk, description, links).publish();
    },
    [ndk],
  );

  const verify = useCallback(
    async (ship: { id: string; pubkey: string }, note?: string) => {
      if (!ndk || !me || me.pubkey === ship.pubkey) return;
      await verifyShipEvent(ndk, ship, note).publish();
    },
    [ndk, me],
  );

  return { post, verify, canVerify: (authorPubkey: string) => !!me && me.pubkey !== authorPubkey };
}

export type { NDKEvent };
