/**
 * Client-side translation service.
 *
 * Supports:
 * 1. Native on-device Translator API (Chrome 138+, Edge 148+ via window.Translator)
 * 2. Remote fallback translation API
 * 3. In-memory & localStorage caching to avoid redundant requests
 * 4. User preference for automatic translation of non-primary language posts
 */

import { inReadableScript, localeScripts } from './lang';

const LS_AUTO_KEY = 'bluey:auto-translate';
const LS_CACHE_KEY = 'bluey:translations-cache';

interface CacheEntry {
  translated: string;
  sourceLang?: string;
  ts: number;
}

const memoryCache = new Map<string, CacheEntry>();
const MAX_PERSISTED_CHARS = 4000;

// Load recent items from localStorage on startup
function initCache() {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(LS_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
      for (const [k, v] of Object.entries(parsed)) {
        memoryCache.set(k, v);
      }
    }
  } catch {
    /* ignore */
  }
}
initCache();

function persistCache() {
  if (typeof window === 'undefined') return;
  try {
    const obj: Record<string, CacheEntry> = {};
    // Keep up to 100 most recent, short ones only: a few long posts would fill
    // localStorage and then nothing could be saved at all
    const entries = Array.from(memoryCache.entries())
      .filter(([k, v]) => k.length + v.translated.length <= MAX_PERSISTED_CHARS)
      .slice(-100);
    for (const [k, v] of entries) {
      obj[k] = v;
    }
    localStorage.setItem(LS_CACHE_KEY, JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

export function isAutoTranslateEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(LS_AUTO_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setAutoTranslateEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_AUTO_KEY, enabled ? 'true' : 'false');
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('bluey:auto-translate-changed'));
}

export function getUserTargetLang(): string {
  if (typeof navigator === 'undefined') return 'en';
  const lang = navigator.language || (navigator.languages && navigator.languages[0]) || 'en';
  return lang.toLowerCase().split('-')[0];
}

interface NativeTranslator {
  translate(text: string): Promise<string>;
}

interface TranslatorGlobal {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(options: { sourceLanguage: string; targetLanguage: string }): Promise<NativeTranslator>;
}

interface NativeDetector {
  detect(text: string): Promise<{ detectedLanguage?: string; confidence?: number }[]>;
}

interface DetectorGlobal {
  availability(): Promise<string>;
  create(): Promise<NativeDetector>;
}

const baseLang = (lang: string) => lang.toLowerCase().split('-')[0];

let detector: Promise<NativeDetector | null> | null = null;

/** The browser's on-device language guess, or null if it has no confident one. */
async function detectLanguage(text: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const api = (window as unknown as { LanguageDetector?: DetectorGlobal }).LanguageDetector;
  if (!api) return null;
  try {
    detector ??= api.availability().then((s) => (s === 'available' ? api.create() : null));
    const d = await detector;
    const top = (await d?.detect(text))?.[0];
    return top?.detectedLanguage && (top.confidence ?? 0) >= 0.6 ? baseLang(top.detectedLanguage) : null;
  } catch {
    return null;
  }
}

/**
 * Whether auto-translate should touch this post. Most posts on a feed are already
 * in the viewer's language, and those must never leave the device: when we can't
 * tell (Latin-script text with no on-device detector), the answer is no and the
 * "Translate post" button is still there.
 */
export async function looksForeign(text: string, targetLang = getUserTargetLang()): Promise<boolean> {
  return (await languageGuess(text, targetLang)) === 'foreign';
}

/**
 * 'same' only when the on-device detector is confident the post is already in
 * the reader's language; 'foreign' when it says otherwise or the script is one
 * the reader doesn't use; 'unknown' when there's no way to tell.
 */
export async function languageGuess(
  text: string,
  targetLang = getUserTargetLang(),
): Promise<'same' | 'foreign' | 'unknown'> {
  const source = await detectLanguage(text);
  if (source) return source === baseLang(targetLang) ? 'same' : 'foreign';
  return inReadableScript(text, localeScripts()) ? 'unknown' : 'foreign';
}

/* Links and nostr: references are swapped for numbered placeholders before
 * translating, so they're never sent off the device and can't be altered. */
const PROTECTED = /https?:\/\/\S+|nostr:\S+/g;

function mask(text: string): { masked: string; tokens: string[] } {
  const tokens: string[] = [];
  const masked = text.replace(PROTECTED, (t) => `[${tokens.push(t) - 1}]`);
  return { masked, tokens };
}

/** Put the originals back, or null if any placeholder didn't survive intact. */
function unmask(translated: string, tokens: string[]): string | null {
  let out = translated;
  for (let i = 0; i < tokens.length; i++) {
    const ph = `[${i}]`;
    if (out.split(ph).length !== 2) return null;
    out = out.replace(ph, () => tokens[i]);
  }
  return out;
}

const nativeTranslators = new Map<string, Promise<NativeTranslator | null>>();

async function tryNativeTranslate(text: string, source: string, targetLang: string): Promise<string | null> {
  if (typeof window === 'undefined' || source === targetLang) return null;
  const api = (window as unknown as { Translator?: TranslatorGlobal }).Translator;
  if (!api) return null;

  const options = { sourceLanguage: source, targetLanguage: targetLang };
  const key = `${source}:${targetLang}`;
  try {
    let translator = nativeTranslators.get(key);
    if (!translator) {
      translator = api.availability(options).then((s) => (s === 'available' ? api.create(options) : null));
      nativeTranslators.set(key, translator);
    }
    return (await (await translator)?.translate(text)) ?? null;
  } catch {
    return null; // fall back to the remote endpoint
  }
}

/** Longest `q` value per request, URL-encoded. Past this, servers may refuse the GET. */
const MAX_ENCODED_CHUNK = 6000;

/** Split long text into URL-safe pieces, at sentence or line ends where possible. */
function chunkForUrl(text: string): string[] {
  const size = (s: string) => encodeURIComponent(s).length;
  if (size(text) <= MAX_ENCODED_CHUNK) return [text];

  const chunks: string[] = [];
  let current = '';
  for (const piece of text.split(/(?<=[.!?。！？\n])/u)) {
    if (size(current + piece) <= MAX_ENCODED_CHUNK) {
      current += piece;
      continue;
    }
    if (current) chunks.push(current);
    current = '';
    if (size(piece) <= MAX_ENCODED_CHUNK) {
      current = piece;
      continue;
    }
    // one enormous sentence: cut by character
    for (const ch of piece) {
      if (size(current + ch) > MAX_ENCODED_CHUNK) {
        chunks.push(current);
        current = '';
      }
      current += ch;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** One request at a time: a feed full of foreign posts shouldn't fire dozens at once. */
let remoteQueue: Promise<unknown> = Promise.resolve();

function remoteTranslate(text: string, targetLang: string): Promise<{ text: string; sourceLang?: string }> {
  const run = async () => {
    let sourceLang: string | undefined;
    let translated = '';
    for (const chunk of chunkForUrl(text)) {
      const res = await remoteTranslateChunk(chunk, targetLang);
      translated += res.text;
      sourceLang ??= res.sourceLang;
    }
    return { text: translated, sourceLang };
  };
  const result = remoteQueue.then(run, run);
  remoteQueue = result.catch(() => undefined);
  return result;
}

async function remoteTranslateChunk(
  text: string,
  targetLang: string,
): Promise<{ text: string; sourceLang?: string }> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(
    targetLang,
  )}&dt=t&q=${encodeURIComponent(text)}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Translation request failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as [unknown[], unknown, string | undefined];
  // data[0] is array of [[translatedChunk, originalChunk, ...], ...]
  // data[2] is detected source language code
  if (Array.isArray(data) && Array.isArray(data[0])) {
    const translated = (data[0] as [string, string][])
      .map((item) => (Array.isArray(item) ? item[0] : ''))
      .join('');
    const sourceLang = typeof data[2] === 'string' ? data[2] : undefined;
    return { text: translated, sourceLang };
  }
  throw new Error('Unexpected translation response format');
}

export async function translateText(
  text: string,
  targetLang = getUserTargetLang(),
): Promise<{ text: string; sourceLang?: string }> {
  const trimmed = text.trim();
  if (!trimmed) return { text: '' };

  const cacheKey = `${targetLang}:${trimmed}`;
  const cached = memoryCache.get(cacheKey);
  if (cached) {
    return { text: cached.translated, sourceLang: cached.sourceLang };
  }

  const { masked, tokens } = mask(trimmed);

  // 1. Try the on-device Translator API, which needs to be told the source language
  const source = await detectLanguage(trimmed);
  const nativeMasked = source ? await tryNativeTranslate(masked, source, targetLang) : null;
  const native = nativeMasked != null ? unmask(nativeMasked, tokens) : null;
  if (native) {
    memoryCache.set(cacheKey, { translated: native, sourceLang: source ?? undefined, ts: Date.now() });
    persistCache();
    return { text: native, sourceLang: source ?? undefined };
  }

  // 2. Try remote API: masked first, the plain text only if a placeholder got mangled
  const first = await remoteTranslate(masked, targetLang);
  const restored = unmask(first.text, tokens);
  const res = restored != null ? { ...first, text: restored } : await remoteTranslate(trimmed, targetLang);
  memoryCache.set(cacheKey, { translated: res.text, sourceLang: res.sourceLang, ts: Date.now() });
  persistCache();
  return res;
}
