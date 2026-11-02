import {
  KIND,
  SHIP_CATEGORIES,
  SHIP_CATEGORY_NS,
  SHIP_COLLABORATOR,
  SHIP_LABEL_NS,
  SHIP_LABEL_VERIFIED,
  TAG,
  type ShipCategory,
} from '@bluey/shared';
import NDK, { NDKEvent } from '@nostr-dev-kit/ndk';

export interface Ship {
  id: string;
  pubkey: string;
  /** Project name; empty for older Ships, which only carried a description. */
  title: string;
  /** The write-up, without the title line, cover URL and link lines we append for other clients. */
  description: string;
  category: ShipCategory | null;
  tools: string[];
  cover: string | null;
  links: string[];
  collaborators: string[];
  /** NIP-29 club id when the Ship was shared to one club only. */
  club: string | null;
  created_at: number;
}

export interface ShipDraft {
  title: string;
  description: string;
  category: ShipCategory;
  tools: string[];
  cover: string | null;
  links: string[];
  collaborators: string[];
  club: string | null;
}

export const CATEGORY_LABEL: Record<ShipCategory, string> = {
  app: 'App',
  website: 'Website',
  tool: 'Tool',
  'ai-agent': 'AI agent',
  design: 'Design',
  writing: 'Writing',
  video: 'Video',
  other: 'Other',
};

const isUrl = (s: string) => /^https?:\/\/\S+$/.test(s);

export function isShip(e: NDKEvent): boolean {
  return e.kind === KIND.Text && e.tags.some((t) => t[0] === 't' && t[1] === TAG.ship);
}

export function parseShip(e: NDKEvent): Ship {
  const tag = (name: string) => e.tags.find((t) => t[0] === name)?.[1];
  const title = tag('title')?.trim() ?? '';
  const cover = tag('image') ?? null;
  const links = e.tags.filter((t) => t[0] === 'r' && isUrl(t[1])).map((t) => t[1]);
  const category = e.tags.find((t) => t[0] === 'l' && t[2] === SHIP_CATEGORY_NS)?.[1];

  // shipEvent writes "title\n\ndescription\n\ncover\nlinks" so plain Nostr
  // clients render something sensible; peel those parts back off here.
  const extras = new Set([cover, ...links].filter(Boolean));
  const lines = e.content.split('\n');
  if (title && lines[0]?.trim() === title) lines.shift();
  while (lines.length && (extras.has(lines[lines.length - 1].trim()) || !lines[lines.length - 1].trim())) {
    lines.pop();
  }

  return {
    id: e.id,
    pubkey: e.pubkey,
    title,
    description: lines.join('\n').trim(),
    category: (SHIP_CATEGORIES as readonly string[]).includes(category ?? '')
      ? (category as ShipCategory)
      : null,
    tools: e.tags.filter((t) => t[0] === 'tool' && t[1]).map((t) => t[1]),
    cover,
    links,
    collaborators: e.tags
      .filter((t) => t[0] === 'p' && t[3] === SHIP_COLLABORATOR && t[1] !== e.pubkey)
      .map((t) => t[1]),
    club: tag('h') ?? null,
    created_at: e.created_at ?? 0,
  };
}

/**
 * A kind:1 note flagged as proof-of-work. The structured fields ride in tags
 * (`title`, `image`, `tool`, `r`, a self-applied NIP-32 category label and
 * collaborator `p` tags); the content repeats title, cover and links so other
 * Nostr clients still show a readable post. A club-only Ship carries an `h`
 * tag and is published to the clubs relay instead.
 */
export function shipEvent(ndk: NDK, d: ShipDraft): NDKEvent {
  const links = d.links.map((l) => l.trim()).filter(isUrl);
  const tools = [...new Set(d.tools.map((t) => t.trim()).filter(Boolean))];
  const collaborators = [...new Set(d.collaborators)];
  const title = d.title.trim();

  const e = new NDKEvent(ndk);
  e.kind = KIND.Text;
  e.content = [
    title,
    d.description.trim(),
    [d.cover, ...links].filter(Boolean).join('\n'),
  ]
    .filter(Boolean)
    .join('\n\n');
  e.tags = [
    ['t', TAG.ship],
    ['t', 'proof-of-work'],
    ['client', TAG.client],
    ...(title ? [['title', title]] : []),
    ['L', SHIP_CATEGORY_NS],
    ['l', d.category, SHIP_CATEGORY_NS],
    ...tools.map((t) => ['tool', t]),
    ...(d.cover ? [['image', d.cover]] : []),
    ...links.map((l) => ['r', l]),
    ...collaborators.map((pk) => ['p', pk, '', SHIP_COLLABORATOR]),
    ...(d.club ? [['h', d.club]] : []),
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
