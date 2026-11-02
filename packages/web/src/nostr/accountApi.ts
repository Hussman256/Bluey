import NDK, { NDKEvent, type NDKSigner } from '@nostr-dev-kit/ndk';
import { INDEX_URL } from './config';

/**
 * Client for the index service's account endpoints (packages/server/src/accounts.ts).
 * Every write is NIP-98 signed by the account's own key, so the server can tell
 * who is asking without passwords or sessions.
 */
export const INDEX_HTTP = INDEX_URL.replace(/^ws/, 'http').replace(/\/$/, '');

/** Domain names are claimed on (VITE_NAME_DOMAIN, default bluey.xyz). */
export const NAME_DOMAIN = (import.meta.env.VITE_NAME_DOMAIN as string | undefined) || 'bluey.xyz';

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

async function sha256Hex(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function authHeader(ndk: NDK, signer: NDKSigner, url: string, method: string, body: string) {
  const ev = new NDKEvent(ndk);
  ev.kind = 27235; // NIP-98 HTTP auth
  ev.content = '';
  ev.tags = [
    ['u', url],
    ['method', method],
    ...(body ? [['payload', await sha256Hex(body)]] : []),
  ];
  await ev.sign(signer);
  return `Nostr ${b64(JSON.stringify(ev.rawEvent()))}`;
}

/** GET `path`, or POST a NIP-98 signed JSON body when `init` is given. */
export async function call<T>(
  path: string,
  init?: { ndk: NDK; signer: NDKSigner; body: unknown },
  timeoutMs = 8000,
): Promise<T> {
  const url = `${INDEX_HTTP}${path}`;
  const body = init ? JSON.stringify(init.body) : '';
  const res = await fetch(url, {
    method: init ? 'POST' : 'GET',
    headers: init
      ? { 'content-type': 'application/json', authorization: await authHeader(init.ndk, init.signer, url, 'POST', body) }
      : undefined,
    body: init ? body : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw Object.assign(new Error(json.error ?? `HTTP ${res.status}`), { status: res.status });
  return json;
}

export const getKeyBackup = (credentialId: string) =>
  call<{ pubkey: string; blob: string }>(`/v1/keys/${credentialId}`);

export const putKeyBackup = (ndk: NDK, signer: NDKSigner, credentialId: string, blob: string) =>
  call<{ ok: true }>('/v1/keys', { ndk, signer, body: { credentialId, blob } });

export const getMyName = (pubkey: string) =>
  call<{ domain: string; name: string | null; lnTarget: string | null }>(
    `/v1/names?pubkey=${encodeURIComponent(pubkey)}`,
  );

export const checkName = (name: string) =>
  call<{ domain: string; name: string; available: boolean; valid: boolean }>(
    `/v1/names?name=${encodeURIComponent(name)}`,
  );

export const claimName = (ndk: NDK, signer: NDKSigner, name: string, lnTarget: string | null) =>
  call<{ ok: true; address: string }>('/v1/names', { ndk, signer, body: { name, lnTarget } });
