import { NDKEvent } from '@nostr-dev-kit/ndk';
import type NDK from '@nostr-dev-kit/ndk';
import { useNDK, useNDKCurrentUser } from '@nostr-dev-kit/react';
import { useEffect } from 'react';
import { collectEvents } from './collectEvents';
import { syncDmRelays } from './dms';
import { LS, RELAYS_OVERRIDDEN, loadRelayList } from './config';
import { KIND } from './kinds';

/**
 * NIP-65: tells other Nostr apps where to find this person's posts. Without it,
 * apps that look people up this way can miss everything posted from Bluey.
 */

// a local ws:// relay means nothing to anyone else, except in a VITE_RELAYS test setup
const isPublicRelay = (url: string) => RELAYS_OVERRIDDEN || url.startsWith('wss://');

/** The person's current list. `unknown` means relays didn't answer in time, not that there is none. */
async function fetchRelayList(ndk: NDK, pubkey: string): Promise<NDKEvent | null | 'unknown'> {
  const { events, complete } = await collectEvents(ndk, { kinds: [KIND.RelayList], authors: [pubkey] });
  if (!complete) return 'unknown';
  return events.reduce<NDKEvent | null>((a, e) => (!a || (e.created_at ?? 0) > (a.created_at ?? 0) ? e : a), null);
}

async function publishRelayList(ndk: NDK, tags: string[][]) {
  const ev = new NDKEvent(ndk);
  ev.kind = KIND.RelayList;
  ev.content = '';
  ev.tags = tags;
  await ev.publish();
}

function syncedPubkeys(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LS.relayListSynced) ?? '[]');
    return Array.isArray(raw) ? (raw as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Publish a list once, only for people who have none. Someone arriving from
 * another app keeps the list they already have: overwriting it could send their
 * followers to the wrong relays. If relays are slow, this retries next session.
 */
export async function syncRelayList(ndk: NDK, pubkey: string) {
  const synced = syncedPubkeys();
  if (synced.includes(pubkey)) return;

  const ours = loadRelayList();
  if (ndk.pool.connectedRelays().length < Math.min(2, ours.length)) return;

  const existing = await fetchRelayList(ndk, pubkey);
  if (existing === 'unknown') return;
  if (!existing) {
    const tags = ours.filter(isPublicRelay).map((url) => ['r', url]);
    if (!tags.length) return;
    await publishRelayList(ndk, tags);
  }
  localStorage.setItem(LS.relayListSynced, JSON.stringify([...synced, pubkey]));
}

/** Keep the published list in step when someone adds or removes a relay in Settings. */
export async function updateRelayList(ndk: NDK, pubkey: string, change: { add?: string; remove?: string }) {
  try {
    const existing = await fetchRelayList(ndk, pubkey);
    if (existing === 'unknown') return;
    const tags = existing
      ? existing.tags.filter((t) => t[0] === 'r')
      : loadRelayList()
          .filter(isPublicRelay)
          .map((url) => ['r', url]);
    const next = tags.filter((t) => t[1] !== change.remove && t[1] !== change.add);
    if (change.add && isPublicRelay(change.add)) next.push(['r', change.add]);
    if (next.length) await publishRelayList(ndk, next);
  } catch {
    /* the relay still works locally; the list catches up on the next change */
  }
}

export function useRelayListSync() {
  const { ndk } = useNDK();
  const me = useNDKCurrentUser();
  const pubkey = me?.pubkey;

  useEffect(() => {
    if (!ndk || !pubkey) return;
    // give relays a moment to connect after sign-in
    const t = setTimeout(() => {
      void syncRelayList(ndk, pubkey).catch(() => undefined);
      void syncDmRelays(ndk, pubkey).catch(() => undefined);
    }, 5000);
    return () => clearTimeout(t);
  }, [ndk, pubkey]);
}
