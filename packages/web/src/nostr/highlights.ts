import { KIND, TAG } from '@1btc/shared';
import NDK, { NDKEvent, nip19, type NDKFilter } from '@nostr-dev-kit/ndk';
import { useNDK, useSubscribe } from '@nostr-dev-kit/react';
import { useCallback, useMemo } from 'react';
import { addrString, parseAddr, type Addr } from './bootcamps';

/**
 * NIP-84 highlights (kind 9802). A highlight is a verbatim passage lifted from
 * a source — for 1btc, almost always a bootcamp lesson (a kind:30023 article).
 * `.content` is the passage; an `a` tag points at the source and a `p` tag
 * credits its author. An optional `context` tag carries the surrounding text.
 *
 * A highlight with commentary is published as the 9802 PLUS a kind:1 note that
 * quotes it (NIP-18 `q` tag) — that note is what lands in the feed and pulls
 * readers back into the lesson.
 */

export interface Highlight {
  id: string;
  pubkey: string; // who highlighted it
  text: string; // the passage
  context?: string; // surrounding text, if the highlighter kept it
  source: Addr | null; // the lesson / article it came from
  sourceAuthor?: string; // pubkey credited on the source
  created_at: number;
}

export function parseHighlight(e: NDKEvent): Highlight | null {
  const text = e.content.trim();
  if (!text) return null;
  const aTag = e.tags.find((t) => t[0] === 'a')?.[1];
  const pTag = e.tags.find((t) => t[0] === 'p')?.[1];
  return {
    id: e.id,
    pubkey: e.pubkey,
    text,
    context: e.tags.find((t) => t[0] === 'context')?.[1],
    source: aTag ? parseAddr(aTag) : null,
    sourceAuthor: pTag,
    created_at: e.created_at ?? 0,
  };
}

export function neventOf(h: { id: string; pubkey: string; kind?: number }): string {
  return nip19.neventEncode({ id: h.id, author: h.pubkey, kind: h.kind ?? KIND.Highlight });
}

function highlightEvent(
  ndk: NDK,
  opts: { text: string; source: Addr; sourceAuthor?: string; context?: string },
): NDKEvent {
  const e = new NDKEvent(ndk);
  e.kind = KIND.Highlight;
  e.content = opts.text;
  e.tags = [
    ['a', addrString(opts.source)],
    ...(opts.sourceAuthor ? [['p', opts.sourceAuthor, '', 'author']] : []),
    ...(opts.context && opts.context !== opts.text ? [['context', opts.context]] : []),
    ['client', TAG.client],
  ];
  return e;
}

/** Highlights taken from one lesson / article, newest first. */
export function useLessonHighlights(source?: Addr | null): Highlight[] {
  const { events } = useSubscribe(
    source
      ? ([{ kinds: [KIND.Highlight], '#a': [addrString(source)], limit: 100 }] as unknown as NDKFilter[])
      : false,
    { closeOnEose: false },
    [source && addrString(source)],
  );
  return useMemo(() => {
    const seen = new Set<string>();
    return events
      .map(parseHighlight)
      .filter((h): h is Highlight => {
        if (!h || seen.has(h.id)) return false;
        seen.add(h.id);
        return true;
      })
      .sort((a, b) => b.created_at - a.created_at);
  }, [events]);
}

export function useHighlightActions() {
  const { ndk } = useNDK();

  const highlight = useCallback(
    async (opts: {
      text: string;
      source: Addr;
      sourceAuthor?: string;
      context?: string;
      note?: string;
    }): Promise<{ eventId: string; pubkey: string; noted: boolean }> => {
      if (!ndk?.signer) throw new Error('sign in first');
      const me = await ndk.signer.user();

      const hl = highlightEvent(ndk, opts);
      await hl.publish();

      const note = opts.note?.trim();
      if (!note) return { eventId: hl.id, pubkey: me.pubkey, noted: false };

      const quote = new NDKEvent(ndk);
      quote.kind = KIND.Text;
      quote.content = `${note}\n\nnostr:${neventOf(hl)}`;
      quote.tags = [
        ['q', hl.id],
        ['e', hl.id, '', 'mention'],
        ['a', addrString(opts.source)],
        ...(opts.sourceAuthor ? [['p', opts.sourceAuthor]] : []),
      ];
      await quote.publish();
      return { eventId: quote.id, pubkey: me.pubkey, noted: true };
    },
    [ndk],
  );

  return { highlight };
}
