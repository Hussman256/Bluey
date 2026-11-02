import { KIND, SHIP_LABEL_NS, SHIP_LABEL_VERIFIED, TAG } from '@bluey/shared';
import type { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import { useSubscribe } from '@nostr-dev-kit/react';
import { useMemo } from 'react';
import { useClubsRelaySet } from './clubs';
import { isJunkNote } from './notes';
import { useWebOfTrust } from './useWebOfTrust';

/**
 * "Who showed up this week": rankings built only from public, checkable events
 * since Monday 00:00 local time. Nothing here is a stored score; each row shows
 * the facts it was ranked by.
 */
export function weekStart(now = new Date()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
  return Math.floor(d.getTime() / 1000);
}

export interface BuilderRow {
  pubkey: string;
  ships: number;
  vouchesReceived: number;
  vouchesGiven: number;
  finished: number;
}

export interface TutorRow {
  pubkey: string;
  badgesAwarded: number;
  liveClasses: number;
}

export interface ClubRow {
  id: string;
  messages: number;
  posters: number;
  ships: number;
}

const isCompletionAward = (e: NDKEvent) =>
  e.tags.some((t) => t[0] === 'a' && t[1].startsWith(`${KIND.BadgeDefinition}:`) && t[1].endsWith('-complete'));

export function useWeeklyBoard() {
  const since = useMemo(() => weekStart(), []);
  const wot = useWebOfTrust();
  const clubsRelay = useClubsRelaySet();

  const { events: ships } = useSubscribe(
    [{ kinds: [KIND.Text], '#t': [TAG.ship], since, limit: 500 }],
    { closeOnEose: false },
    [since],
  );
  const { events: vouches } = useSubscribe(
    [{ kinds: [KIND.Label], '#L': [SHIP_LABEL_NS], since, limit: 1000 }] as unknown as NDKFilter[],
    { closeOnEose: false },
    [since],
  );
  const { events: awards } = useSubscribe(
    [{ kinds: [KIND.BadgeAward], since, limit: 1000 }],
    { closeOnEose: false },
    [since],
  );
  const { events: lives } = useSubscribe(
    [{ kinds: [KIND.LiveEvent], '#t': [TAG.liveClass], since, limit: 300 }] as unknown as NDKFilter[],
    { closeOnEose: false },
    [since],
  );
  const { events: clubEvents } = useSubscribe(
    clubsRelay ? [{ kinds: [KIND.GroupChatMessage, KIND.Text], since, limit: 2000 }] : false,
    { relaySet: clubsRelay ?? undefined, closeOnEose: false },
    [since, !!clubsRelay],
  );

  return useMemo(() => {
    const trusted = (pk: string) => wot.size === 0 || wot.isTrusted(pk);

    const builders = new Map<string, BuilderRow>();
    const b = (pk: string) => {
      let r = builders.get(pk);
      if (!r) builders.set(pk, (r = { pubkey: pk, ships: 0, vouchesReceived: 0, vouchesGiven: 0, finished: 0 }));
      return r;
    };
    for (const e of ships) {
      if (!isJunkNote(e) && !e.tags.some((t) => t[0] === 'h')) b(e.pubkey).ships++;
    }
    // one vouch per (voucher, ship); the label's p tag is the ship's author
    const seen = new Set<string>();
    for (const e of vouches) {
      if (!e.tags.some((t) => t[0] === 'l' && t[1] === SHIP_LABEL_VERIFIED)) continue;
      const ship = e.tags.find((t) => t[0] === 'e')?.[1];
      const author = e.tags.find((t) => t[0] === 'p')?.[1];
      if (!ship || !author || author === e.pubkey || seen.has(`${e.pubkey}:${ship}`)) continue;
      seen.add(`${e.pubkey}:${ship}`);
      b(author).vouchesReceived++;
      b(e.pubkey).vouchesGiven++;
    }

    const tutors = new Map<string, TutorRow>();
    const t = (pk: string) => {
      let r = tutors.get(pk);
      if (!r) tutors.set(pk, (r = { pubkey: pk, badgesAwarded: 0, liveClasses: 0 }));
      return r;
    };
    for (const e of awards) {
      if (!isCompletionAward(e)) continue;
      const learners = e.tags.filter((x) => x[0] === 'p').map((x) => x[1]);
      t(e.pubkey).badgesAwarded += learners.length;
      for (const pk of learners) b(pk).finished++;
    }
    const classes = new Set<string>();
    for (const e of lives) {
      const key = `${e.pubkey}:${e.dTag ?? ''}`;
      const status = e.tags.find((x) => x[0] === 'status')?.[1];
      if ((status === 'live' || status === 'ended') && !classes.has(key)) {
        classes.add(key);
        t(e.pubkey).liveClasses++;
      }
    }

    const clubs = new Map<string, ClubRow & { who: Set<string> }>();
    for (const e of clubEvents) {
      const id = e.tags.find((x) => x[0] === 'h')?.[1];
      if (!id) continue;
      let r = clubs.get(id);
      if (!r) clubs.set(id, (r = { id, messages: 0, posters: 0, ships: 0, who: new Set() }));
      if (e.kind === KIND.Text) r.ships++;
      else r.messages++;
      r.who.add(e.pubkey);
    }

    const builderRank = (r: BuilderRow) => r.vouchesReceived * 3 + r.ships * 2 + r.finished * 2 + r.vouchesGiven;
    return {
      since,
      builders: [...builders.values()]
        .filter((r) => trusted(r.pubkey) && builderRank(r) > 0)
        .sort((x, y) => builderRank(y) - builderRank(x)),
      tutors: [...tutors.values()]
        .filter((r) => trusted(r.pubkey))
        .sort((x, y) => y.badgesAwarded * 2 + y.liveClasses - (x.badgesAwarded * 2 + x.liveClasses)),
      clubs: [...clubs.values()]
        .map(({ who, ...r }) => ({ ...r, posters: who.size }))
        .sort((x, y) => y.posters * 3 + y.ships * 2 + y.messages - (x.posters * 3 + x.ships * 2 + x.messages)),
    };
  }, [since, wot, ships, vouches, awards, lives, clubEvents]);
}
