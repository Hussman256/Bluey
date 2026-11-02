import type { IncomingMessage, ServerResponse } from 'node:http';
import { decode } from 'nostr-tools/nip19';
import { config } from './config.ts';
import { nip98, readBody, send } from './http.ts';
import * as q from './queries.ts';

/**
 * Account HTTP endpoints next to the index WebSocket:
 *
 *   GET  /v1/keys/:credentialId    passkey-encrypted key backup (opaque to us)
 *   POST /v1/keys                  store one            (NIP-98 signed)
 *   GET  /v1/names?pubkey=… | ?name=…
 *   POST /v1/names                 claim a name + where its sats go (NIP-98 signed)
 *   GET  /v1/card?handle=…         name, bio and photo for a /@name link preview
 *   GET  /.well-known/nostr.json   NIP-05
 *   GET  /.well-known/lnurlp/:name Lightning address, forwarded to the owner's wallet
 *
 * Nothing here holds funds: the Lightning address hands back the owner's own
 * wallet's LNURL-pay response, so the payer's wallet pays that wallet directly.
 */

const NAME_RE = /^[a-z0-9][a-z0-9_.-]{1,29}$/;
const RESERVED = new Set([
  '_', 'admin', 'administrator', 'api', 'bluey', 'curator', 'help', 'mod', 'moderator',
  'official', 'root', 'security', 'staff', 'support', 'team', 'www',
]);
const LN_ADDRESS_RE = /^[a-z0-9._+-]{1,64}@[a-z0-9.-]+\.[a-z]{2,}$/i;

/** The owner's wallet's own LUD-16 response, or null if it didn't answer. */
async function upstreamPayRequest(address: string): Promise<{ ok: boolean; json: Record<string, unknown> } | null> {
  const [user, domain] = address.split('@');
  try {
    const r = await fetch(`https://${domain}/.well-known/lnurlp/${encodeURIComponent(user)}`, {
      signal: AbortSignal.timeout(6000),
      headers: { accept: 'application/json' },
    });
    return { ok: r.ok, json: (await r.json()) as Record<string, unknown> };
  } catch {
    return null;
  }
}

async function lnurlp(res: ServerResponse, name: string) {
  const row = q.nameByName(name);
  if (!row?.ln_target) {
    return send(res, 404, { status: 'ERROR', reason: 'This name has no Lightning wallet connected yet.' });
  }
  const up = await upstreamPayRequest(row.ln_target);
  if (!up) return send(res, 502, { status: 'ERROR', reason: 'The wallet behind this address did not answer.' });
  return send(res, up.ok ? 200 : 502, up.json);
}

/**
 * What a link preview shows for /@handle, or null if we don't know them.
 * Addresses on other domains aren't looked up: this runs on anyone's URL, so it
 * must not fetch hosts a stranger picks. Those links get the generic preview.
 * No Ship or vouch counts either: the index prunes events after RETENTION_DAYS,
 * so they would undercount anyone active for longer than that.
 */
function card(raw: string) {
  const handle = raw.trim().replace(/^@/, '').toLowerCase();
  const local = handle.endsWith(`@${config.nameDomain}`) ? handle.slice(0, -config.nameDomain.length - 1) : handle;

  let pubkey: string | undefined;
  if (/^[0-9a-f]{64}$/.test(local)) pubkey = local;
  else if (local.startsWith('npub1')) {
    try {
      const d = decode(local);
      if (d.type === 'npub') pubkey = d.data;
    } catch {
      /* not a real npub */
    }
  }
  const claimed = pubkey ? q.nameByPubkey(pubkey) : q.nameByName(local);
  pubkey ??= claimed?.pubkey;
  if (!pubkey) return null;

  const p = q.profileCard(pubkey);
  if (!p && !claimed) return null;
  return {
    pubkey,
    name: p?.display_name || p?.name || claimed?.name || null,
    about: p?.about || null,
    picture: p?.picture || null,
  };
}

export async function handleAccountsHttp(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://local');
  const path = url.pathname;
  const isOurs = path.startsWith('/v1/') || path.startsWith('/.well-known/');
  if (!isOurs) return false;

  if (req.method === 'OPTIONS') {
    send(res, 204, null);
    return true;
  }

  try {
    // ---- NIP-05 ----
    if (req.method === 'GET' && path === '/.well-known/nostr.json') {
      const name = (url.searchParams.get('name') ?? '').toLowerCase();
      const row = name ? q.nameByName(name) : undefined;
      send(res, 200, { names: row ? { [row.name]: row.pubkey } : {} });
      return true;
    }

    // ---- Lightning address ----
    const ln = path.match(/^\/\.well-known\/lnurlp\/([^/]+)$/);
    if (req.method === 'GET' && ln) {
      await lnurlp(res, decodeURIComponent(ln[1]).toLowerCase());
      return true;
    }

    // ---- link preview card ----
    if (req.method === 'GET' && path === '/v1/card') {
      const c = card(url.searchParams.get('handle') ?? '');
      send(res, c ? 200 : 404, c ?? { error: 'not found' });
      return true;
    }

    // ---- key backups ----
    const key = path.match(/^\/v1\/keys\/([A-Za-z0-9_-]{8,512})$/);
    if (req.method === 'GET' && key) {
      const row = q.keyBackup(key[1]);
      send(res, row ? 200 : 404, row ?? { error: 'not found' });
      return true;
    }
    if (req.method === 'POST' && path === '/v1/keys') {
      const body = await readBody(req);
      const pubkey = nip98(req, path, body);
      if (!pubkey) return (send(res, 401, { error: 'sign the request with your Nostr key (NIP-98)' }), true);
      const { credentialId, blob } = JSON.parse(body) as { credentialId?: string; blob?: string };
      if (!credentialId || !/^[A-Za-z0-9_-]{8,512}$/.test(credentialId) || !blob || blob.length > 4096) {
        return (send(res, 400, { error: 'bad credentialId or blob' }), true);
      }
      const ok = q.saveKeyBackup(credentialId, pubkey, blob);
      send(res, ok ? 200 : 409, ok ? { ok: true } : { error: 'that passkey belongs to another account' });
      return true;
    }

    // ---- names ----
    if (req.method === 'GET' && path === '/v1/names') {
      const pk = url.searchParams.get('pubkey');
      const name = url.searchParams.get('name')?.toLowerCase();
      if (pk) {
        const row = q.nameByPubkey(pk);
        send(res, 200, { domain: config.nameDomain, name: row?.name ?? null, lnTarget: row?.ln_target ?? null });
      } else if (name) {
        const valid = NAME_RE.test(name) && !RESERVED.has(name);
        send(res, 200, { domain: config.nameDomain, name, available: valid && !q.nameByName(name), valid });
      } else {
        send(res, 400, { error: 'pubkey or name required' });
      }
      return true;
    }
    if (req.method === 'POST' && path === '/v1/names') {
      const body = await readBody(req);
      const pubkey = nip98(req, path, body);
      if (!pubkey) return (send(res, 401, { error: 'sign the request with your Nostr key (NIP-98)' }), true);
      const { name: raw, lnTarget: rawTarget } = JSON.parse(body) as { name?: string; lnTarget?: string | null };
      const name = (raw ?? '').trim().toLowerCase();
      if (!NAME_RE.test(name) || RESERVED.has(name)) {
        return (send(res, 400, { error: 'Use 2–30 letters, numbers, dots, dashes or underscores' }), true);
      }
      const lnTarget = rawTarget?.trim().toLowerCase() || null;
      if (lnTarget && (!LN_ADDRESS_RE.test(lnTarget) || lnTarget.endsWith(`@${config.nameDomain}`))) {
        return (send(res, 400, { error: 'Enter the Lightning address of a wallet you own, like you@walletofsatoshi.com' }), true);
      }
      if (lnTarget) {
        // refuse a typo now rather than let every zap to this name fail later
        const up = await upstreamPayRequest(lnTarget);
        if (up?.json.tag !== 'payRequest') {
          const why = typeof up?.json.reason === 'string' ? ` (${up.json.reason})` : '';
          return (send(res, 400, { error: `That Lightning address didn't answer${why}. Copy it again from your wallet app.` }), true);
        }
      }
      const ok = q.claimName(name, pubkey, lnTarget);
      send(res, ok ? 200 : 409, ok ? { ok: true, address: `${name}@${config.nameDomain}` } : { error: 'That name is taken' });
      return true;
    }
  } catch (e) {
    send(res, 400, { error: e instanceof Error ? e.message : 'bad request' });
    return true;
  }

  send(res, 404, { error: 'not found' });
  return true;
}
