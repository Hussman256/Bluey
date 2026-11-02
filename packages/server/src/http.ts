import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { verifyEvent, type Event } from 'nostr-tools/pure';

/** Small helpers shared by the HTTP endpoints (accounts.ts, learning.ts). */

export function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
  });
  res.end(JSON.stringify(body));
}

export function readBody(req: IncomingMessage, maxBytes = 16 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error('body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** NIP-98: returns the signer's pubkey if the Authorization header is a fresh, valid event for this request. */
export function nip98(req: IncomingMessage, path: string, body: string): string | null {
  const h = req.headers.authorization ?? '';
  if (!h.startsWith('Nostr ')) return null;
  let ev: Event;
  try {
    ev = JSON.parse(Buffer.from(h.slice(6), 'base64').toString('utf8'));
  } catch {
    return null;
  }
  if (ev.kind !== 27235 || Math.abs(Date.now() / 1000 - ev.created_at) > 60) return null;
  const tag = (n: string) => ev.tags.find((t) => t[0] === n)?.[1];
  if (tag('method')?.toUpperCase() !== req.method) return null;
  try {
    // the index sits behind a proxy in production, so compare the path only
    if (new URL(tag('u') ?? '').pathname !== path) return null;
  } catch {
    return null;
  }
  if (body && tag('payload') !== createHash('sha256').update(body).digest('hex')) return null;
  try {
    return verifyEvent(ev) ? ev.pubkey : null;
  } catch {
    return null;
  }
}
