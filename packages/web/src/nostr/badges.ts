import { KIND } from '@1btc/shared';
import NDK, { NDKEvent } from '@nostr-dev-kit/ndk';
import { useSubscribe } from '@nostr-dev-kit/react';
import { useMemo } from 'react';
import { addrString, parseAddr, type Addr, type Bootcamp } from './bootcamps';

const tag = (e: NDKEvent, n: string) => e.tags.find((t) => t[0] === n)?.[1];

export const completionBadgeId = (bootcampId: string) => `${bootcampId}-complete`;

export function badgeDefEvent(ndk: NDK, bootcamp: Bootcamp) {
  const e = new NDKEvent(ndk);
  e.kind = KIND.BadgeDefinition;
  e.tags = [
    ['d', completionBadgeId(bootcamp.id)],
    ['name', `${bootcamp.title} — Completed`],
    ['description', `Completed the ${bootcamp.title} bootcamp on 1btc.`],
    ...(bootcamp.image ? [['image', bootcamp.image]] : []),
  ];
  return e;
}

export function awardEvent(ndk: NDK, badge: Addr, learnerPubkey: string) {
  const e = new NDKEvent(ndk);
  e.kind = KIND.BadgeAward;
  e.tags = [
    ['a', addrString(badge)],
    ['p', learnerPubkey],
  ];
  return e;
}

export interface EarnedBadge {
  name: string;
  description?: string;
  image?: string;
  issuer: string;
  awardedAt: number;
}

/** Badges awarded to `pubkey`, resolved against their definitions. */
export function useProfileBadges(pubkey?: string): EarnedBadge[] {
  const { events: awards } = useSubscribe(
    pubkey ? [{ kinds: [KIND.BadgeAward], '#p': [pubkey], limit: 100 }] : false,
    { closeOnEose: false },
    [pubkey],
  );

  const defAddrs = useMemo(
    () =>
      [
        ...new Set(
          awards
            .map((a) => tag(a, 'a'))
            .filter((s): s is string => !!s),
        ),
      ]
        .map(parseAddr)
        .filter((a): a is Addr => !!a),
    [awards],
  );

  const { events: defs } = useSubscribe(
    defAddrs.length
      ? [
          {
            kinds: [KIND.BadgeDefinition],
            authors: [...new Set(defAddrs.map((a) => a.pubkey))],
            '#d': defAddrs.map((a) => a.identifier),
          },
        ]
      : false,
    { closeOnEose: false },
    [defAddrs.map(addrString).join(',')],
  );

  return useMemo(() => {
    const defMap = new Map(defs.map((d) => [`${d.pubkey}:${tag(d, 'd')}`, d] as const));
    const out: EarnedBadge[] = [];
    for (const a of awards) {
      const addr = parseAddr(tag(a, 'a') ?? '');
      const def = addr && defMap.get(`${addr.pubkey}:${addr.identifier}`);
      if (!def) continue;
      out.push({
        name: tag(def, 'name') ?? 'Badge',
        description: tag(def, 'description'),
        image: tag(def, 'image'),
        issuer: a.pubkey,
        awardedAt: a.created_at ?? 0,
      });
    }
    return out.sort((x, y) => y.awardedAt - x.awardedAt);
  }, [awards, defs]);
}

/** Whether `learner` holds the completion badge for a bootcamp. */
export function useHasCompletionBadge(bootcamp: Bootcamp | null, learner?: string): boolean {
  const { events } = useSubscribe(
    bootcamp && learner
      ? [
          {
            kinds: [KIND.BadgeAward],
            authors: [bootcamp.pubkey],
            '#p': [learner],
          },
        ]
      : false,
    { closeOnEose: false },
    [bootcamp?.id, learner],
  );
  return useMemo(() => {
    if (!bootcamp) return false;
    const want = `${KIND.BadgeDefinition}:${bootcamp.pubkey}:${completionBadgeId(bootcamp.id)}`;
    return events.some((e) => tag(e, 'a') === want);
  }, [events, bootcamp]);
}
