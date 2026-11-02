import NDK, { NDKUser } from '@nostr-dev-kit/ndk';
import { INDEX_HTTP, NAME_DOMAIN } from './accountApi';
import { pubkeyFrom } from './ids';

/**
 * Resolve what follows "/@" in a public URL to a pubkey:
 *   /@ada                      → ada@<NAME_DOMAIN>, asked of the index first
 *   /@ada@example.com          → any NIP-05 address
 *   /@npub1…  /@<hex>          → used as-is
 */
export async function resolveHandle(ndk: NDK, raw: string): Promise<string | null> {
  const handle = decodeURIComponent(raw).trim().replace(/^@/, '');
  const direct = pubkeyFrom(handle);
  if (direct) return direct;

  if (handle.includes('@')) {
    return (await NDKUser.fromNip05(handle, ndk).catch(() => undefined))?.pubkey ?? null;
  }

  const name = handle.toLowerCase();
  try {
    const r = await fetch(`${INDEX_HTTP}/.well-known/nostr.json?name=${encodeURIComponent(name)}`, {
      signal: AbortSignal.timeout(5000),
    });
    const pk = ((await r.json()) as { names?: Record<string, string> }).names?.[name];
    if (pk) return pk;
  } catch {
    /* index offline: fall back to the public domain below */
  }
  return (await NDKUser.fromNip05(`${name}@${NAME_DOMAIN}`, ndk).catch(() => undefined))?.pubkey ?? null;
}

/** Public page URL for a Bluey name, e.g. https://bluey.xyz/@ada */
export const publicPageUrl = (name: string) => `${window.location.origin}/@${name}`;
