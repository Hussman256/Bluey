import { KIND, TAG } from '@1btc/shared';
import type { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import { useNDK, useSubscribe } from '@nostr-dev-kit/react';
import { useCallback, useMemo } from 'react';
import {
  addrString,
  bootcampEvent,
  lessonEvent,
  liveChatEvent,
  liveClassEvent,
  parseBootcamp,
  parseLesson,
  parseLiveClass,
  slug,
  type Addr,
  type Bootcamp,
  type Lesson,
  type LiveClass,
} from './bootcamps';
import { useClubActions } from './useClubs';

function newestByD<T extends { pubkey: string }>(events: NDKEvent[], parse: (e: NDKEvent) => T | null) {
  const map = new Map<string, { e: NDKEvent; parsed: T }>();
  for (const e of events) {
    const d = e.tags.find((t) => t[0] === 'd')?.[1] ?? '';
    const key = `${e.pubkey}:${d}`;
    const prev = map.get(key);
    if (!prev || (e.created_at ?? 0) > (prev.e.created_at ?? 0)) {
      const parsed = parse(e);
      if (parsed) map.set(key, { e, parsed });
    }
  }
  return [...map.values()].map((v) => v.parsed);
}

export function useBootcampList(): { bootcamps: Bootcamp[]; loading: boolean } {
  const { events, eose } = useSubscribe(
    [{ kinds: [KIND.CurationSet], '#t': [TAG.bootcamp], limit: 200 }],
    { closeOnEose: false },
    [],
  );
  const bootcamps = useMemo(
    () =>
      newestByD(events, parseBootcamp).sort((a, b) => b.created_at - a.created_at),
    [events],
  );
  return { bootcamps, loading: !eose && bootcamps.length === 0 };
}

export function useBootcamp(pubkey?: string, id?: string) {
  const { events } = useSubscribe(
    pubkey && id
      ? [{ kinds: [KIND.CurationSet], authors: [pubkey], '#d': [id] }]
      : false,
    { closeOnEose: false },
    [pubkey, id],
  );
  return useMemo(() => newestByD(events, parseBootcamp)[0] ?? null, [events]);
}

const EMPTY_ADDRS: Addr[] = [];

export function useLessons(bootcamp: Bootcamp | null): Lesson[] {
  const addrs = bootcamp?.lessons ?? EMPTY_ADDRS;
  const { events } = useSubscribe(
    addrs.length
      ? [
          {
            kinds: [KIND.Article],
            authors: [...new Set(addrs.map((a) => a.pubkey))],
            '#d': addrs.map((a) => a.identifier),
          },
        ]
      : false,
    { closeOnEose: false },
    [addrs.map(addrString).join(',')],
  );
  return useMemo(() => {
    const byKey = new Map(newestByD(events, parseLesson).map((l) => [`${l.pubkey}:${l.id}`, l]));
    return addrs
      .map((a) => byKey.get(`${a.pubkey}:${a.identifier}`))
      .filter((l): l is Lesson => !!l);
  }, [events, addrs]);
}

export function useLesson(pubkey?: string, id?: string): Lesson | null {
  const { events } = useSubscribe(
    pubkey && id ? [{ kinds: [KIND.Article], authors: [pubkey], '#d': [id] }] : false,
    { closeOnEose: false },
    [pubkey, id],
  );
  return useMemo(() => newestByD(events, parseLesson)[0] ?? null, [events]);
}

export function useLiveClasses(bootcampAddr?: Addr): LiveClass[] {
  const { events } = useSubscribe(
    bootcampAddr
      ? ([{ kinds: [KIND.LiveEvent], '#a': [addrString(bootcampAddr)], limit: 100 }] as unknown as NDKFilter[])
      : false,
    { closeOnEose: false },
    [bootcampAddr && addrString(bootcampAddr)],
  );
  return useMemo(
    () => newestByD(events, parseLiveClass).sort((a, b) => (b.starts ?? b.created_at) - (a.starts ?? a.created_at)),
    [events],
  );
}

export function useLiveClass(pubkey?: string, id?: string): LiveClass | null {
  const { events } = useSubscribe(
    pubkey && id
      ? ([{ kinds: [KIND.LiveEvent], authors: [pubkey], '#d': [id] }] as unknown as NDKFilter[])
      : false,
    { closeOnEose: false },
    [pubkey, id],
  );
  return useMemo(() => newestByD(events, parseLiveClass)[0] ?? null, [events]);
}

export function useLiveChat(live?: Addr): NDKEvent[] {
  const { events } = useSubscribe(
    live
      ? ([{ kinds: [KIND.LiveChatMessage], '#a': [addrString(live)], limit: 300 }] as unknown as NDKFilter[])
      : false,
    { closeOnEose: false },
    [live && addrString(live)],
  );
  return useMemo(
    () => events.slice().sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0)),
    [events],
  );
}

export function useBootcampActions() {
  const { ndk } = useNDK();
  const clubs = useClubActions();

  const create = useCallback(
    async (title: string, description?: string): Promise<{ id: string; pubkey: string }> => {
      if (!ndk?.signer) throw new Error('sign in first');
      const me = await ndk.signer.user();
      const cohortId = await clubs.create(`${title} — cohort`, description);
      const id = slug(title);
      await bootcampEvent(ndk, { id, title, description, cohortId, lessons: [] }).publish();
      return { id, pubkey: me.pubkey };
    },
    [ndk, clubs],
  );

  const addLesson = useCallback(
    async (
      bootcamp: Bootcamp,
      lesson: { title: string; summary?: string; content: string },
    ) => {
      if (!ndk) throw new Error('not ready');
      const lessonId = slug(lesson.title);
      const lessonAddr: Addr = { kind: KIND.Article, pubkey: bootcamp.pubkey, identifier: lessonId };
      await lessonEvent(ndk, bootcamp.addr, { id: lessonId, ...lesson }).publish();
      // republish the bootcamp with the new lesson appended
      await bootcampEvent(ndk, {
        id: bootcamp.id,
        title: bootcamp.title,
        description: bootcamp.description,
        image: bootcamp.image,
        cohortId: bootcamp.cohortId,
        lessons: [...bootcamp.lessons, lessonAddr],
      }).publish();
    },
    [ndk],
  );

  const scheduleLive = useCallback(
    async (
      bootcamp: Bootcamp,
      live: { title: string; summary?: string; starts?: number; streaming?: string },
    ) => {
      if (!ndk) throw new Error('not ready');
      await liveClassEvent(ndk, bootcamp.addr, {
        id: slug(live.title) + '-' + Math.random().toString(36).slice(2, 6),
        status: 'planned',
        ...live,
      }).publish();
    },
    [ndk],
  );

  const setLiveStatus = useCallback(
    async (live: LiveClass, status: LiveClass['status'], streaming?: string) => {
      if (!ndk) throw new Error('not ready');
      await liveClassEvent(
        ndk,
        live.bootcampAddr ?? live.addr,
        {
          id: live.id,
          title: live.title,
          summary: live.summary,
          status,
          starts: live.starts,
          streaming: streaming ?? live.streaming,
        },
      ).publish();
    },
    [ndk],
  );

  const sendLiveChat = useCallback(
    async (live: Addr, text: string) => {
      if (!ndk) throw new Error('not ready');
      await liveChatEvent(ndk, live, text).publish();
    },
    [ndk],
  );

  return { create, addLesson, scheduleLive, setLiveStatus, sendLiveChat };
}
