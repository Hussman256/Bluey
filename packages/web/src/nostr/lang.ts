/**
 * Lightweight script matching for the feed.
 *
 * Discover ranks by web of trust, but until a viewer has a real follow graph the
 * feed leans on recency — and the highest-volume corners of Nostr (Japanese,
 * Chinese, Russian, Tamil…) then dominate a global feed with posts most people
 * can't read. This keeps the feed to the scripts the viewer's locale uses.
 */

export type Script = 'latin' | 'cjk' | 'cyrillic' | 'arabic';

const LS_KEY = '1btc:feed-langs';

// CJK: hiragana, katakana, CJK ideographs (incl. Chinese hanzi), Hangul, halfwidth kana
const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯ｦ-ﾟ]/u;
const CYRILLIC = /\p{Script=Cyrillic}/u;
const ARABIC = /\p{Script=Arabic}/u;
const LATIN = /[A-Za-zÀ-ɏ]/;
const GREEK = /\p{Script=Greek}/u;

const LOCALE_SCRIPT: Record<string, Script> = {
  ja: 'cjk',
  zh: 'cjk',
  ko: 'cjk',
  ru: 'cyrillic',
  uk: 'cyrillic',
  bg: 'cyrillic',
  sr: 'cyrillic',
  ar: 'arabic',
  fa: 'arabic',
  ur: 'arabic',
};

/** Scripts the viewer reads — Latin always, plus whatever their locales imply. */
export function readableScripts(): Set<Script> {
  try {
    if (localStorage.getItem(LS_KEY) === 'all') {
      return new Set<Script>(['latin', 'cjk', 'cyrillic', 'arabic']);
    }
  } catch {
    /* ignore */
  }
  const set = new Set<Script>(['latin']);
  const locales =
    typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [];
  for (const l of locales) {
    const base = l.toLowerCase().split('-')[0];
    if (LOCALE_SCRIPT[base]) set.add(LOCALE_SCRIPT[base]);
  }
  return set;
}

export function feedLangMode(): 'all' | 'mine' {
  try {
    return localStorage.getItem(LS_KEY) === 'all' ? 'all' : 'mine';
  } catch {
    return 'mine';
  }
}

export function setFeedLangMode(mode: 'all' | 'mine') {
  try {
    localStorage.setItem(LS_KEY, mode === 'all' ? 'all' : 'mine');
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('1btc:feed-langs'));
}

/**
 * True if enough of this text is in a script the viewer reads. Counts letters,
 * not bytes — CJK is dense, so "物騒だな" (4 chars) is a full sentence and must
 * still be judged. Any non-readable script (Thai, Tamil, Devanagari, …) that
 * isn't Latin/Greek and isn't one the viewer opted into counts against it.
 */
export function inReadableScript(content: string, scripts: Set<Script>): boolean {
  const s = content
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/nostr:\S+/g, ' ')
    .replace(/[#@]\S+/g, ' ');
  const letters = s.match(/\p{L}/gu);
  if (!letters || letters.length < 4) return true; // too little text to judge

  let readable = 0;
  for (const ch of letters) {
    if (LATIN.test(ch) || GREEK.test(ch)) readable++;
    else if (scripts.has('cjk') && CJK.test(ch)) readable++;
    else if (scripts.has('cyrillic') && CYRILLIC.test(ch)) readable++;
    else if (scripts.has('arabic') && ARABIC.test(ch)) readable++;
  }
  return readable / letters.length >= 0.6;
}

/** Repost content is the embedded event JSON — judge the note it wraps. */
export function repostInReadableScript(content: string, scripts: Set<Script>): boolean {
  try {
    const inner = JSON.parse(content) as { content?: string };
    if (inner?.content) return inReadableScript(inner.content, scripts);
  } catch {
    /* not embedded JSON */
  }
  return true;
}
