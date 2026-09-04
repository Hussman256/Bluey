import { KIND, SHIP_LABEL_NS, SHIP_LABEL_VERIFIED, TAG } from '@1btc/shared';
import NDK, { NDKEvent } from '@nostr-dev-kit/ndk';

export interface Ship {
  id: string;
  pubkey: string;
  content: string;
  links: string[];
  created_at: number;
}

export function isShip(e: NDKEvent): boolean {
  return e.kind === KIND.Text && e.tags.some((t) => t[0] === 't' && t[1] === TAG.ship);
}

export function parseShip(e: NDKEvent): Ship {
  return {
    id: e.id,
    pubkey: e.pubkey,
    content: e.content,
    links: e.tags.filter((t) => t[0] === 'r' && /^https?:\/\//.test(t[1])).map((t) => t[1]),
    created_at: e.created_at ?? 0,
  };
}

/** A kind:1 note flagged as proof-of-work, with repo / demo links. */
export function shipEvent(ndk: NDK, description: string, links: string[]): NDKEvent {
  const e = new NDKEvent(ndk);
  e.kind = KIND.Text;
  e.content = description;
  e.tags = [
    ['t', TAG.ship],
    ['t', 'proof-of-work'],
    ['client', TAG.client],
    ...links.filter((l) => /^https?:\/\//.test(l.trim())).map((l) => ['r', l.trim()]),
  ];
  return e;
}

/** A NIP-32 label attesting that a ship is verified real work. */
export function verifyShipEvent(
  ndk: NDK,
  ship: { id: string; pubkey: string },
  note?: string,
): NDKEvent {
  const e = new NDKEvent(ndk);
  e.kind = KIND.Label;
  e.content = note ?? '';
  e.tags = [
    ['L', SHIP_LABEL_NS],
    ['l', SHIP_LABEL_VERIFIED, SHIP_LABEL_NS],
    ['e', ship.id],
    ['p', ship.pubkey],
  ];
  return e;
}

/** Distinct verifiers of a ship, from its label events. */
export function verifiersOf(labels: NDKEvent[], shipId: string): Set<string> {
  const out = new Set<string>();
  for (const l of labels) {
    if (l.kind !== KIND.Label) continue;
    if (!l.tags.some((t) => t[0] === 'e' && t[1] === shipId)) continue;
    if (!l.tags.some((t) => t[0] === 'l' && t[1] === SHIP_LABEL_VERIFIED)) continue;
    out.add(l.pubkey);
  }
  return out;
}
