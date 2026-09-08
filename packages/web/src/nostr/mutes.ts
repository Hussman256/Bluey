import type { NDKEvent } from '@nostr-dev-kit/ndk';
import { NDKEvent as NDKEventCtor } from '@nostr-dev-kit/ndk';
import { useNDK, useNDKCurrentUser, useSubscribe } from '@nostr-dev-kit/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KIND } from './kinds';

/**
 * NIP-51 mute list (kind 10000). Public tags, kept simple: muted words,
 * hashtags and pubkeys. Cached in localStorage for instant load and published
 * so the list follows the user to other clients.
 */

const LS_KEY = '1btc:mutes';
const MUTE_KIND = 10000;

export interface Mutes {
  words: string[];
  hashtags: string[];
  pubkeys: string[];
}

const EMPTY: Mutes = { words: [], hashtags: [], pubkeys: [] };

function norm(list: unknown): string[] {
  return Array.isArray(list)
    ? [...new Set(list.filter((s): s is string => typeof s === 'string' && !!s.trim()).map((s) => s.trim()))]
    : [];
}

export function loadMutes(): Mutes {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}');
    return {
      words: norm(raw.words).map((w) => w.toLowerCase()),
      hashtags: norm(raw.hashtags).map((h) => h.replace(/^#/, '').toLowerCase()),
      pubkeys: norm(raw.pubkeys),
    };
  } catch {
    return EMPTY;
  }
}

function saveMutes(m: Mutes) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(m));
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new Event('1btc:mutes'));
}

function fromEvent(e: NDKEvent): Mutes {
  return {
    words: norm(e.tags.filter((t) => t[0] === 'word').map((t) => t[1])).map((w) => w.toLowerCase()),
    hashtags: norm(e.tags.filter((t) => t[0] === 't').map((t) => t[1])).map((h) =>
      h.replace(/^#/, '').toLowerCase(),
    ),
    pubkeys: norm(e.tags.filter((t) => t[0] === 'p').map((t) => t[1])),
  };
}

/** The current mute set — localStorage, reconciled with the user's kind:10000. */
export function useMutes(): Mutes {
  const me = useNDKCurrentUser();
  const [local, setLocal] = useState<Mutes>(loadMutes);

  useEffect(() => {
    const h = () => setLocal(loadMutes());
    window.addEventListener('1btc:mutes', h);
    window.addEventListener('storage', h);
    return () => {
      window.removeEventListener('1btc:mutes', h);
      window.removeEventListener('storage', h);
    };
  }, []);

  const { events } = useSubscribe(
    me ? [{ kinds: [MUTE_KIND], authors: [me.pubkey] }] : false,
    { closeOnEose: false },
    [me?.pubkey],
  );

  return useMemo(() => {
    const latest = events
      .slice()
      .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))[0];
    const remote = latest ? fromEvent(latest) : null;
    if (!remote) return local;
    // union — the local list may have edits not yet published
    return {
      words: [...new Set([...local.words, ...remote.words])],
      hashtags: [...new Set([...local.hashtags, ...remote.hashtags])],
      pubkeys: [...new Set([...local.pubkeys, ...remote.pubkeys])],
    };
  }, [events, local]);
}

export function useMuteActions() {
  const { ndk } = useNDK();
  const mutes = useMutes();

  const publish = useCallback(
    async (next: Mutes) => {
      saveMutes(next);
      if (!ndk?.signer) return;
      const ev = new NDKEventCtor(ndk);
      ev.kind = MUTE_KIND;
      ev.tags = [
        ...next.words.map((w) => ['word', w]),
        ...next.hashtags.map((h) => ['t', h]),
        ...next.pubkeys.map((p) => ['p', p]),
      ];
      ev.content = '';
      await ev.publish().catch(() => undefined);
    },
    [ndk],
  );

  return {
    mutes,
    addWord: (w: string) => {
      const v = w.trim().toLowerCase().replace(/^#/, '');
      if (!v) return;
      const isTag = w.trim().startsWith('#');
      return publish(
        isTag
          ? { ...mutes, hashtags: [...new Set([...mutes.hashtags, v])] }
          : { ...mutes, words: [...new Set([...mutes.words, v])] },
      );
    },
    removeWord: (w: string) =>
      publish({
        ...mutes,
        words: mutes.words.filter((x) => x !== w),
        hashtags: mutes.hashtags.filter((x) => x !== w),
      }),
    mutePubkey: (pk: string) =>
      publish({ ...mutes, pubkeys: [...new Set([...mutes.pubkeys, pk])] }),
    unmutePubkey: (pk: string) =>
      publish({ ...mutes, pubkeys: mutes.pubkeys.filter((x) => x !== pk) }),
  };
}

/** Does this event trip the mute list? */
export function isMuted(e: NDKEvent, m: Mutes): boolean {
  if (m.pubkeys.includes(e.pubkey)) return true;
  if (e.kind !== KIND.Text && e.kind !== KIND.Highlight) return false;
  const c = e.content.toLowerCase();
  for (const w of m.words) if (c.includes(w)) return true;
  if (m.hashtags.length) {
    const tags = e.tags.filter((t) => t[0] === 't').map((t) => (t[1] ?? '').toLowerCase());
    for (const h of m.hashtags) {
      if (tags.includes(h) || c.includes(`#${h}`)) return true;
    }
  }
  return false;
}
