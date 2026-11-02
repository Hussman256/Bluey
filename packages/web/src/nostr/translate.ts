/**
 * Client-side translation service.
 *
 * Supports:
 * 1. Native on-device Translator API (Chrome 138+, Edge 148+ via window.Translator)
 * 2. Remote fallback translation API
 * 3. In-memory & localStorage caching to avoid redundant requests
 * 4. User preference for automatic translation of non-primary language posts
 */

const LS_AUTO_KEY = 'bluey:auto-translate';
const LS_CACHE_KEY = 'bluey:translations-cache';

interface CacheEntry {
  translated: string;
  sourceLang?: string;
  ts: number;
}

const memoryCache = new Map<string, CacheEntry>();

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
    // Keep up to 100 most recent
    const entries = Array.from(memoryCache.entries()).slice(-100);
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
  availability(options: { sourceLanguage?: string; targetLanguage: string }): Promise<string>;
  create(options: { sourceLanguage?: string; targetLanguage: string }): Promise<NativeTranslator>;
}

async function tryNativeTranslate(text: string, targetLang: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const translatorApi = (window as unknown as { Translator?: TranslatorGlobal }).Translator;
  if (!translatorApi) return null;

  try {
    const status = await translatorApi.availability({ targetLanguage: targetLang });
    if (status === 'available') {
      const translator = await translatorApi.create({ targetLanguage: targetLang });
      return await translator.translate(text);
    }
  } catch {
    // Fall back to HTTP translation endpoint
  }
  return null;
}

async function remoteTranslate(
  text: string,
  targetLang: string,
): Promise<{ text: string; sourceLang?: string }> {
  // Use public single query translation endpoint with fallback
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

  // 1. Try native on-device Translator API
  const native = await tryNativeTranslate(trimmed, targetLang);
  if (native) {
    memoryCache.set(cacheKey, { translated: native, ts: Date.now() });
    persistCache();
    return { text: native };
  }

  // 2. Try remote API
  const res = await remoteTranslate(trimmed, targetLang);
  memoryCache.set(cacheKey, { translated: res.text, sourceLang: res.sourceLang, ts: Date.now() });
  persistCache();
  return res;
}
