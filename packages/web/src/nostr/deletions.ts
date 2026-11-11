import { NDKEvent } from '@nostr-dev-kit/ndk';
import type NDK from '@nostr-dev-kit/ndk';
import { useSubscribe } from '@nostr-dev-kit/react';
import { useMemo, useSyncExternalStore } from 'react';
import { LS } from './config';
import { KIND } from './kinds';

/**
 * NIP-09 deletion. Nostr can only ask: relays and other apps may keep a copy, so
 * the app also remembers what you deleted here and hides it right away, and
 * honours deletion events it sees from a post's own author.
 */

const MAX_REMEMBERED = 500;

function load(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(LS.deleted) ?? '[]');
    return new Set(Array.isArray(raw) ? (raw as string[]) : []);
  } catch {
    return new Set();
  }
}

let local = load();
const listeners = new Set<() => void>();

function subscribeLocal(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function markDeleted(id: string) {
  local = new Set(local).add(id);
  try {
    localStorage.setItem(LS.deleted, JSON.stringify([...local].slice(-MAX_REMEMBERED)));
  } catch {
    /* still hidden until the page reloads */
  }
  listeners.forEach((fn) => fn());
}

/** Publish a deletion request for one of your own events. Throws if no relay took it. */
export async function deleteEvent(ndk: NDK, event: NDKEvent) {
  const d = new NDKEvent(ndk);
  d.kind = KIND.Deletion;
  d.content = '';
  d.tags = [
    ['e', event.id],
    ['k', String(event.kind)],
  ];
  await d.publish();
  markDeleted(event.id);
}

export function useIsDeleted(id: string): boolean {
  return useSyncExternalStore(subscribeLocal, () => local.has(id));
}

/**
 * Ids among `events` that are deleted: by you on this device, or by a deletion
 * event from the post's own author. Anyone else's deletion is ignored.
 */
export function useDeletedIds(events: NDKEvent[]): Set<string> {
  const mine = useSyncExternalStore(subscribeLocal, () => local);
  const ids = useMemo(() => events.slice(0, 300).map((e) => e.id), [events]);
  const key = useMemo(() => ids.slice().sort().join(','), [ids]);

  const { events: deletions } = useSubscribe(
    ids.length ? [{ kinds: [KIND.Deletion], '#e': ids }] : false,
    { closeOnEose: false },
    [key],
  );

  return useMemo(() => {
    const authors = new Map(events.map((e) => [e.id, e.pubkey]));
    const out = new Set<string>();
    for (const e of events) if (mine.has(e.id)) out.add(e.id);
    for (const d of deletions) {
      for (const t of d.tags) {
        if (t[0] === 'e' && authors.get(t[1]) === d.pubkey) out.add(t[1]);
      }
    }
    return out;
  }, [events, deletions, mine]);
}
