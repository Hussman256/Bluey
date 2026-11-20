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

  // machine payload dumps: one enormous unbroken token (base64 blobs, serialized
  // state) or a mesh/broadcast bot envelope
  if (/\S{220,}/.test(c)) return true;
  // a note that is one long machine token and nothing else (e.g. the
  // `sp_<hex>.<n>.<BASE32>.drift.gits.net` beacon flood, shorter base64
  // blobs). Things people do post on their own are let through: links, npubs
  // and other NIP-19 codes, invoices, cashu tokens, on-chain addresses.
  if (
    /^[A-Za-z0-9._+/=-]{60,}$/.test(c) &&
    !/^(?:npub1|nprofile1|note1|nevent1|naddr1|lnbc|lntb|lnurl|cashu|bc1)/i.test(c)
  ) {
    return true;
  }
  if (/^\[broadcast:|"maxHop"\s*:|"ar_profile"|"msg_uuid"/i.test(c)) return true;

  // crypto "airdrop / check eligibility / claim your reward" phishing: the bait
  // words together with a link carrying a referral code
  if (
    /\b(?:airdrop|eligibility|claim (?:your|now|here)|community reward|flash drop|wallet connect bonus)\b/i.test(c) &&
    /https?:\/\/\S+[?&](?:ref|r|invite|code)=\w+/i.test(c)
  ) {
    return true;
  }

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

/** Hashtags and words that mark adult content. Matched as whole tags / words. */
const ADULT_TAGS = new Set([
  'nsfw', 'porn', 'porno', 'nude', 'nudes', 'nudity', 'xxx', 'sex', 'sexy', 'onlyfans', 'hentai',
  'boobs', 'tits', 'ass', 'pussy', 'naked', 'lingerie', 'fetish', 'milf', 'cum', 'horny', 'erotic', 'adult',
]);
const ADULT_WORDS = /\b(?:nsfw|porn\w*|nudes?|xxx|onlyfans|hentai|pussy|horny|erotic)\b/i;

/**
 * Whether a post should stay out of feeds that show strangers' posts
 * (Discover, Trending): marked sensitive (NIP-36), tagged or worded as adult,
 * or mirrored from another network through a bridge (NIP-48 `proxy` tag).
 * Following feeds are the viewer's own choice and don't use this.
 */
export function isSensitive(tags: string[][], content: string): boolean {
  for (const t of tags) {
    if (t[0] === 'content-warning' || t[0] === 'proxy') return true;
    if (t[0] === 't' && t[1] && ADULT_TAGS.has(t[1].toLowerCase())) return true;
    if (t[0] === 'L' && t[1]?.toLowerCase() === 'content-warning') return true;
  }
  return ADULT_WORDS.test(content);
}
