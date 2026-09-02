import { nip19 } from '@nostr-dev-kit/ndk';

export function npubOf(pubkey: string): string {
  try {
    return nip19.npubEncode(pubkey);
  } catch {
    return pubkey;
  }
}

export function shortNpub(pubkey: string): string {
  const n = npubOf(pubkey);
  return n.startsWith('npub1') ? `${n.slice(0, 10)}…${n.slice(-4)}` : n.slice(0, 12);
}

/** hex pubkey from npub / nprofile / raw hex, or null. */
export function pubkeyFrom(raw?: string): string | null {
  if (!raw) return null;
  if (/^[0-9a-f]{64}$/i.test(raw)) return raw;
  try {
    const d = nip19.decode(raw);
    if (d.type === 'npub') return d.data;
    if (d.type === 'nprofile') return d.data.pubkey;
  } catch {
    /* ignore */
  }
  return null;
}

/** hex event id from note / nevent / raw hex, or null. */
export function eventIdFrom(raw?: string): string | null {
  if (!raw) return null;
  if (/^[0-9a-f]{64}$/i.test(raw)) return raw;
  try {
    const d = nip19.decode(raw);
    if (d.type === 'note') return d.data;
    if (d.type === 'nevent') return d.data.id;
  } catch {
    /* ignore */
  }
  return null;
}
