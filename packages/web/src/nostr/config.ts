/**
 * Relay + service configuration for 1btc.
 *
 * DEFAULT_RELAYS is the public relay set NDK connects to directly. Two more
 * 1btc-operated services layer on top when reachable (both optional, both
 * degrade gracefully): the index service (nostr/indexClient.ts) and the clubs
 * relay (nostr/clubs.ts).
 */
export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://nostr.wine',
  'wss://relay.snort.social',
];

/** Relays that reliably carry NIP-23 long-form articles. */
export const READS_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://nostr.wine',
];

/** Fallback zap/relay hints for NWC pairing discovery. */
export const NWC_RELAY_HINTS = ['wss://relay.getalby.com/v1', 'wss://relay.primal.net'];

/** Blossom media servers — first is primary, second is upload fallback. */
export const BLOSSOM_PRIMARY = 'https://blossom.primal.net';
export const BLOSSOM_FALLBACK = 'https://blossom.band';

export const APP_NAME = '1btc';
export const APP_TAGLINE = 'Learn Bitcoin. Find your people.';

/** The index service URL actually in effect (honours VITE_INDEX_URL). */
export const INDEX_URL = (import.meta.env.VITE_INDEX_URL as string | undefined) || 'ws://localhost:8787';

/** Local-storage keys — namespaced so nothing collides with NDK's own. */
export const LS = {
  nwc: '1btc:nwc-uri',
  relays: '1btc:relays',
  feedTab: '1btc:feed-tab',
  dvmFeeds: '1btc:dvm-feeds',
} as const;

/** The relay set to boot with: user-added relays (if any) merged over the defaults. */
export function loadRelayList(): string[] {
  try {
    const extra = JSON.parse(localStorage.getItem(LS.relays) ?? '[]');
    if (Array.isArray(extra) && extra.every((r) => typeof r === 'string')) {
      return [...new Set([...DEFAULT_RELAYS, ...extra])];
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_RELAYS;
}

export function saveExtraRelays(urls: string[]) {
  const extra = urls.filter((u) => !DEFAULT_RELAYS.includes(u));
  localStorage.setItem(LS.relays, JSON.stringify(extra));
}
