/**
 * Shared spam heuristics — used client-side to filter feeds/trending and
 * server-side to refuse the worst content at ingest so it never reaches the DB.
 *
 * The dominant Nostr spam pattern is SEO "backlink" / "related-search" farms:
 * a wall of #HASHTAGS interleaved with tracking URLs and no actual prose.
 * These heuristics target that shape. They are deliberately conservative — a
 * real post with a few hashtags and a link is never caught.
 */

/** Link-farm / "related-search" domains that flood the firehose. */
export const SPAM_DOMAINS = [
  'aepiot.ro',
  'aepiot.com',
  'allgraph.ro',
  'nesot.ro',
  'globalgraph.ro',
  'headlines-world.com',
  'aiavatar.ro',
];

const SEARCH_FARM =
  /(related-search\.html|\/search\.html\?|[?&](?:reports|q|lang)=[A-Za-z0-9%]{8,})/gi;
const HASHTAG = /(?:^|\s)#[\p{L}\p{N}_]{2,}/gu;
const URL = /https?:\/\/\S+/gi;

const HEX64 = /\b[0-9a-f]{64}\b/gi;

export function isSpamContent(content: string): boolean {
  const c = (content ?? '').trim();
  if (!c) return true;

  const lower = c.toLowerCase();
  for (const d of SPAM_DOMAINS) if (lower.includes(d)) return true;

  // bot roster / "hex salad" dumps: `channel:__roster` + walls of raw pubkeys
  if (/^channel:__?\w+/i.test(c)) return true;
  const hexHits = (c.match(HEX64) ?? []).length;
  // raw 64-char hex is only ever machine output in a kind:1 — a couple with
  // barely any other text, or a wall of them, is a bot dump
  const nonHex = c.replace(HEX64, '').replace(/[\s,]+/g, '');
  if (hexHits >= 4) return true;
  if (hexHits >= 1 && nonHex.length < 24) return true;

  // several "?reports=FOO%20BAR" / "search.html?q=" style links in one note
  if ((c.match(SEARCH_FARM) ?? []).length >= 2) return true;

  const hashtags = (c.match(HASHTAG) ?? []).length;
  const urls = (c.match(URL) ?? []).length;

  // prose left after stripping hashtags + URLs + punctuation
  const prose = c
    .replace(HASHTAG, ' ')
    .replace(URL, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim();
  const proseWords = prose ? prose.split(/\s+/).filter((w) => w.length > 1).length : 0;

  // keyword salad: many tags/links, almost no sentence
  if (hashtags >= 15) return true;
  if (hashtags >= 8 && proseWords < 6) return true;
  if (hashtags + urls >= 10 && proseWords < 8) return true;

  return false;
}
