import { KIND, TAG } from '@1btc/shared';
import NDK, { NDKEvent, nip19 } from '@nostr-dev-kit/ndk';

// ---------- addressable-event helpers ----------
export interface Addr {
  kind: number;
  pubkey: string;
  identifier: string;
}
export const addrString = (a: Addr) => `${a.kind}:${a.pubkey}:${a.identifier}`;
export function parseAddr(s: string): Addr | null {
  const [kind, pubkey, ...rest] = s.split(':');
  if (!kind || !pubkey) return null;
  return { kind: Number(kind), pubkey, identifier: rest.join(':') };
}
export const naddrOf = (a: Addr) =>
  nip19.naddrEncode({ kind: a.kind, pubkey: a.pubkey, identifier: a.identifier });
export function addrFromNaddr(naddr: string): Addr | null {
  try {
    const d = nip19.decode(naddr);
    if (d.type === 'naddr') {
      return { kind: d.data.kind, pubkey: d.data.pubkey, identifier: d.data.identifier };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || Math.random().toString(36).slice(2, 10);

// ---------- parsers ----------
const tag = (e: NDKEvent, n: string) => e.tags.find((t) => t[0] === n)?.[1];
const dOf = (e: NDKEvent) => tag(e, 'd') ?? '';

export interface Bootcamp {
  id: string; // d tag
  pubkey: string; // tutor
  title: string;
  description?: string;
  image?: string;
  cohortId?: string; // clubs-relay group id
  lessons: Addr[]; // ordered
  created_at: number;
  addr: Addr;
}

export function parseBootcamp(e: NDKEvent): Bootcamp | null {
  const id = dOf(e);
  if (!id) return null;
  return {
    id,
    pubkey: e.pubkey,
    title: tag(e, 'title') ?? 'Untitled bootcamp',
    description: tag(e, 'description'),
    image: tag(e, 'image'),
    cohortId: tag(e, 'cohort'),
    lessons: e.tags
      .filter((t) => t[0] === 'a')
      .map((t) => parseAddr(t[1]))
      .filter((a): a is Addr => !!a && a.kind === KIND.Article),
    created_at: e.created_at ?? 0,
    addr: { kind: KIND.CurationSet, pubkey: e.pubkey, identifier: id },
  };
}

export interface Lesson {
  id: string;
  pubkey: string;
  title: string;
  summary?: string;
  image?: string;
  content: string;
  published_at: number;
  bootcampAddr?: Addr;
  addr: Addr;
}
export function parseLesson(e: NDKEvent): Lesson | null {
  const id = dOf(e);
  if (!id) return null;
  const bc = e.tags.find((t) => t[0] === 'a' && t[1].startsWith(`${KIND.CurationSet}:`))?.[1];
  return {
    id,
    pubkey: e.pubkey,
    title: tag(e, 'title') ?? 'Untitled lesson',
    summary: tag(e, 'summary'),
    image: tag(e, 'image'),
    content: e.content,
    published_at: Number(tag(e, 'published_at')) || e.created_at || 0,
    bootcampAddr: bc ? parseAddr(bc) ?? undefined : undefined,
    addr: { kind: KIND.Article, pubkey: e.pubkey, identifier: id },
  };
}

export interface LiveClass {
  id: string;
  pubkey: string;
  title: string;
  summary?: string;
  status: 'planned' | 'live' | 'ended';
  starts?: number;
  streaming?: string;
  bootcampAddr?: Addr;
  addr: Addr;
  created_at: number;
}
export function parseLiveClass(e: NDKEvent): LiveClass | null {
  const id = dOf(e);
  if (!id) return null;
  const status = (tag(e, 'status') as LiveClass['status']) ?? 'planned';
  const bc = e.tags.find((t) => t[0] === 'a' && t[1].startsWith(`${KIND.CurationSet}:`))?.[1];
  return {
    id,
    pubkey: e.pubkey,
    title: tag(e, 'title') ?? 'Live class',
    summary: tag(e, 'summary'),
    status: ['planned', 'live', 'ended'].includes(status) ? status : 'planned',
    starts: Number(tag(e, 'starts')) || undefined,
    streaming: tag(e, 'streaming'),
    bootcampAddr: bc ? parseAddr(bc) ?? undefined : undefined,
    addr: { kind: KIND.LiveEvent, pubkey: e.pubkey, identifier: id },
    created_at: e.created_at ?? 0,
  };
}

// ---------- event builders ----------
function base(ndk: NDK, kind: number, tags: string[][], content = '') {
  const e = new NDKEvent(ndk);
  e.kind = kind;
  e.tags = tags;
  e.content = content;
  return e;
}

export function bootcampEvent(
  ndk: NDK,
  b: { id: string; title: string; description?: string; image?: string; cohortId?: string; lessons: Addr[] },
) {
  return base(ndk, KIND.CurationSet, [
    ['d', b.id],
    ['title', b.title],
    ...(b.description ? [['description', b.description]] : []),
    ...(b.image ? [['image', b.image]] : []),
    ...(b.cohortId ? [['cohort', b.cohortId]] : []),
    ['t', TAG.bootcamp],
    ['client', TAG.client],
    ...b.lessons.map((a) => ['a', addrString(a), '', 'lesson']),
  ]);
}

export function lessonEvent(
  ndk: NDK,
  bootcampAddr: Addr,
  l: { id: string; title: string; summary?: string; image?: string; content: string },
) {
  return base(
    ndk,
    KIND.Article,
    [
      ['d', l.id],
      ['title', l.title],
      ...(l.summary ? [['summary', l.summary]] : []),
      ...(l.image ? [['image', l.image]] : []),
      ['published_at', String(Math.floor(Date.now() / 1000))],
      ['t', TAG.lesson],
      ['client', TAG.client],
      ['a', addrString(bootcampAddr)],
    ],
    l.content,
  );
}

export function liveClassEvent(
  ndk: NDK,
  bootcampAddr: Addr,
  l: {
    id: string;
    title: string;
    summary?: string;
    status: 'planned' | 'live' | 'ended';
    starts?: number;
    streaming?: string;
  },
) {
  return base(ndk, KIND.LiveEvent, [
    ['d', l.id],
    ['title', l.title],
    ...(l.summary ? [['summary', l.summary]] : []),
    ['status', l.status],
    ...(l.starts ? [['starts', String(l.starts)]] : []),
    ...(l.streaming ? [['streaming', l.streaming]] : []),
    ['t', TAG.liveClass],
    ['client', TAG.client],
    ['a', addrString(bootcampAddr)],
  ]);
}

export function liveChatEvent(ndk: NDK, live: Addr, text: string) {
  return base(ndk, KIND.LiveChatMessage, [['a', addrString(live), '', 'root']], text);
}
