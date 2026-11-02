import { useSyncExternalStore } from 'react';
import { addrString, type Addr } from './bootcamps';
import { LS } from './config';

/**
 * Which lessons this learner has opened, per bootcamp. Kept on this device only:
 * progress is a private convenience, not a public signal (completion badges are).
 */
type Store = Record<string, string[]>;

const EVENT = 'bluey:progress-changed';

function read(): Store {
  try {
    const raw = JSON.parse(localStorage.getItem(LS.lessonsRead) ?? '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

let cache: { raw: string | null; store: Store } = { raw: null, store: {} };
function snapshot(): Store {
  const raw = localStorage.getItem(LS.lessonsRead);
  if (raw !== cache.raw) cache = { raw, store: read() };
  return cache.store;
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

export function markLessonRead(bootcamp: Addr, lessonId: string) {
  const store = read();
  const key = addrString(bootcamp);
  const done = new Set(store[key] ?? []);
  if (done.has(lessonId)) return;
  done.add(lessonId);
  localStorage.setItem(LS.lessonsRead, JSON.stringify({ ...store, [key]: [...done] }));
  window.dispatchEvent(new Event(EVENT));
}

/** Lesson ids (d tags) opened in this bootcamp. */
export function useLessonsRead(bootcamp?: Addr | null): Set<string> {
  const store = useSyncExternalStore(subscribe, snapshot);
  return new Set(bootcamp ? (store[addrString(bootcamp)] ?? []) : []);
}
