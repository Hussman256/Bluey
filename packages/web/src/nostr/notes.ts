import { isSpamContent } from '@1btc/shared';
import type { NDKEvent } from '@nostr-dev-kit/ndk';
import { KIND } from './kinds';

/** A kind:1 that is a reply / quote rather than a top-level post. */
export function isReplyNote(e: NDKEvent): boolean {
  return (
    e.kind === KIND.Text &&
    e.tags.some((t) => t[0] === 'e' || t[0] === 'a' || t[0] === 'q')
  );
}

/**
 * Heuristic junk filter: structured-JSON dumps (some clients post those) and
 * SEO link-farm / hashtag-salad spam (see @1btc/shared `isSpamContent`).
 */
export function isJunkNote(e: NDKEvent): boolean {
  if (e.kind !== KIND.Text) return false;
  const c = e.content.trim();
  if (!c) return true;
  if ((c.startsWith('{') && c.endsWith('}')) || (c.startsWith('[{') && c.endsWith('}]'))) {
    try {
      const v = JSON.parse(c);
      if (v && typeof v === 'object') return true;
    } catch {
      /* not JSON — keep it */
    }
  }
  return isSpamContent(c);
}

/** The event id whose engagement a feed row represents (unwraps reposts). */
export function subjectId(e: NDKEvent): string {
  if (e.kind === KIND.Repost || e.kind === KIND.GenericRepost) {
    return e.tags.find((t) => t[0] === 'e')?.[1] ?? e.id;
  }
  return e.id;
}
