/**
 * Lightweight script matching for the feed.
 *
 * Discover ranks by web of trust, but until a viewer has a real follow graph the
 * feed leans on recency — and the highest-volume corners of Nostr (Japanese,
 * Chinese, Russian) then dominate a global feed with posts most people can't
 * read. This lets a viewer keep the feed to the scripts their own locale uses.
 */

export type Script = 'latin' | 'cjk' | 'cyrillic' | 'arabic' | 'other';

const LS_KEY = '1btc:feed-langs';

const RANGES: Record<Exclude<Script, 'latin' | 'other'>, RegExp> = {
  cjk: /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯ｦ-ﾟ]/u,
  cyrillic: /\p{Script=Cyrillic}/u,
  arabic: /\p{Script=Arabic}/u,
};

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

/** Scripts the viewer reads — their locales, plus any manual override. */
export function readableScripts(): Set<Script> {
  const set = new Set<Script>(['latin']); // ~every locale also reads Latin (URLs, names)
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved === 'all') return new Set(['latin', 'cjk', 'cyrillic', 'arabic', 'other']);
  } catch {
    /* ignore */
  }
  const locales = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [];
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

/** True if this note's dominant script is one the viewer reads. */
export function inReadableScript(content: string, scripts: Set<Script>): boolean {
  const s = content.replace(/https?:\/\/\S+/g, ' ').replace(/[#@]\S+/g, ' ');
  const letters = s.match(/\p{L}/gu);
  if (!letters || letters.length < 10) return true; // too short to judge

  const counts: Record<Script, number> = { latin: 0, cjk: 0, cyrillic: 0, arabic: 0, other: 0 };
  for (const ch of letters) {
    if (RANGES.cjk.test(ch)) counts.cjk++;
    else if (RANGES.cyrillic.test(ch)) counts.cyrillic++;
    else if (RANGES.arabic.test(ch)) counts.arabic++;
    else if (/[a-zA-ZÀ-ɏ]/.test(ch)) counts.latin++;
    else counts.other++;
  }
  // dominant non-Latin script must be one the viewer reads
  const total = letters.length;
  for (const script of ['cjk', 'cyrillic', 'arabic'] as const) {
    if (counts[script] / total >= 0.3 && !scripts.has(script)) return false;
  }
  return true;
}
