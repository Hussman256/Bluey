import { LS } from './config';
import { pubkeyFrom } from './ids';

export type BuiltinFeed = 'following' | 'discover' | 'ships' | 'latest';

export interface DvmFeed {
  kind: 'dvm';
  id: string; // dvm pubkey (hex)
  name: string;
}
export interface BuiltinFeedRef {
  kind: 'builtin';
  id: BuiltinFeed;
  name: string;
}
export type FeedRef = BuiltinFeedRef | DvmFeed;

export const BUILTIN_FEEDS: BuiltinFeedRef[] = [
  { kind: 'builtin', id: 'following', name: 'Following' },
  { kind: 'builtin', id: 'discover', name: 'Discover' },
  { kind: 'builtin', id: 'ships', name: 'Ships' },
  { kind: 'builtin', id: 'latest', name: 'Latest' },
];

const KEY = LS.dvmFeeds;

export function loadDvmFeeds(): DvmFeed[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (Array.isArray(raw)) return raw.filter((f) => f?.id && f?.name).map((f) => ({ ...f, kind: 'dvm' as const }));
  } catch {
    /* ignore */
  }
  return [];
}

export function addDvmFeed(input: string, name: string): DvmFeed | null {
  const pk = pubkeyFrom(input.trim());
  if (!pk) return null;
  const feeds = loadDvmFeeds();
  if (feeds.some((f) => f.id === pk)) return feeds.find((f) => f.id === pk) ?? null;
  const feed: DvmFeed = { kind: 'dvm', id: pk, name: name.trim() || 'DVM feed' };
  localStorage.setItem(KEY, JSON.stringify([...feeds, feed]));
  return feed;
}

export function removeDvmFeed(id: string) {
  localStorage.setItem(KEY, JSON.stringify(loadDvmFeeds().filter((f) => f.id !== id)));
}
