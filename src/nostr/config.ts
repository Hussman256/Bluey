/**
 * Relay configuration for 1btc.
 *
 * Phase 1 rides entirely on public relays — no 1btc-operated relay or caching
 * service yet. The DEFAULT set is used for the general feed and profile lookups;
 * later phases add a 1btc caching-service websocket and a NIP-29 group relay.
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

export const APP_NAME = '1btc';
export const APP_TAGLINE = 'Build in public. Get zapped.';

/** Local-storage keys — namespaced so nothing collides with NDK's own. */
export const LS = {
  nwc: '1btc:nwc-uri',
  relays: '1btc:relays',
  feedTab: '1btc:feed-tab',
} as const;
