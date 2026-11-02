import NDK, { NDKEvent } from '@nostr-dev-kit/ndk';
import { useSubscribe } from '@nostr-dev-kit/react';
import { useMemo } from 'react';
import { KIND } from './kinds';

export type RawProfile = Record<string, unknown>;

/** The newest kind 0 as raw JSON, so fields Bluey doesn't know about survive a save. */
export function useRawProfile(pubkey?: string): RawProfile | null {
  const { events } = useSubscribe(
    pubkey ? [{ kinds: [KIND.Metadata], authors: [pubkey], limit: 1 }] : false,
    { closeOnEose: true },
    [pubkey],
  );
  return useMemo(() => {
    const e = events.slice().sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))[0];
    if (!e) return null;
    try {
      return JSON.parse(e.content) as RawProfile;
    } catch {
      return null;
    }
  }, [events]);
}

/** Publish `base` with `patch` applied; empty-string values remove a field. */
export async function publishProfile(ndk: NDK, base: RawProfile | null, patch: RawProfile) {
  const merged: RawProfile = { ...(base ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === '' || v == null) delete merged[k];
    else merged[k] = v;
  }
  const ev = new NDKEvent(ndk);
  ev.kind = KIND.Metadata;
  ev.content = JSON.stringify(merged);
  const relays = await ev.publish(undefined, 6000);
  if (relays.size === 0) throw new Error('No relay accepted the update. Try again.');
  return merged;
}
