import { KIND, SHIP_COLLABORATOR, SHIP_LABEL_NS, TAG } from '@bluey/shared';
import type { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import { useNDK, useNDKCurrentUser, useSubscribe } from '@nostr-dev-kit/react';
import { useCallback, useMemo } from 'react';
import { useClubsRelaySet } from './clubs';
import { useDeletedIds } from './deletions';
import { isJunkNote } from './notes';
import { shipEvent, verifiersOf, verifyShipEvent, type ShipDraft } from './ships';
import { useWebOfTrust } from './useWebOfTrust';

/**
 * Ship notes (kind 1 tagged proof-of-work), newest first, WoT-filtered.
 * Scoped to a pubkey, it also returns Ships that credit them as a collaborator.
 */
export function useShipFeed(scopePubkey?: string, enabled = true) {
  const wot = useWebOfTrust();
  const { events } = useSubscribe(
    enabled
      ? scopePubkey
        ? [
            { kinds: [KIND.Text], authors: [scopePubkey], '#t': [TAG.ship], limit: 100 },
            { kinds: [KIND.Text], '#p': [scopePubkey], '#t': [TAG.ship], limit: 100 },
          ]
        : [{ kinds: [KIND.Text], '#t': [TAG.ship], limit: 200 }]
      : false,
    { closeOnEose: false },
    [scopePubkey, enabled],
  );

  const deleted = useDeletedIds(events);

  return useMemo(() => {
    let list = events.filter((e) => !isJunkNote(e) && !deleted.has(e.id));
    if (scopePubkey) {
      list = list.filter(
        (e) =>
          e.pubkey === scopePubkey ||
          e.tags.some((t) => t[0] === 'p' && t[1] === scopePubkey && t[3] === SHIP_COLLABORATOR),
      );
    } else if (wot.size > 0) {
      list = list.filter((e) => wot.isTrusted(e.pubkey));
    }
    return list
      .slice()
      .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
      .slice(0, 120);
  }, [events, deleted, wot, scopePubkey]);
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
  const clubsRelay = useClubsRelaySet();

  /** Publishes a Ship and returns its event, so callers can link to it. */
  const post = useCallback(
    async (draft: ShipDraft): Promise<NDKEvent> => {
      if (!ndk) throw new Error('not ready');
      const ev = shipEvent(ndk, draft);
      if (draft.club) {
        if (!clubsRelay) throw new Error('The clubs relay is not connected');
        await ev.publish(clubsRelay);
      } else {
        await ev.publish();
      }
      return ev;
    },
    [ndk, clubsRelay],
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
