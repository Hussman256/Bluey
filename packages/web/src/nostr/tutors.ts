import { KIND, TUTOR_LIST_D } from '@bluey/shared';
import { giftWrap, NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { useNDK, useNDKCurrentUser, useSubscribe } from '@nostr-dev-kit/react';
import { useCallback, useMemo } from 'react';
import { CURATOR_PUBKEY } from './config';

/**
 * Approved tutors: the `p` tags of the curator's NIP-51 follow set.
 *
 * With no curator configured (`configured: false`) nobody is "verified" and the
 * catalogue lists every bootcamp, so a dev setup still has something to show.
 */
export function useApprovedTutors() {
  const { events, eose } = useSubscribe(
    CURATOR_PUBKEY
      ? [{ kinds: [KIND.FollowSet], authors: [CURATOR_PUBKEY], '#d': [TUTOR_LIST_D] }]
      : false,
    { closeOnEose: false },
    [],
  );

  return useMemo(() => {
    const latest = events.reduce<NDKEvent | null>(
      (best, e) => (!best || (e.created_at ?? 0) > (best.created_at ?? 0) ? e : best),
      null,
    );
    const tutors = new Set(latest?.tags.filter((t) => t[0] === 'p').map((t) => t[1]) ?? []);
    return {
      configured: !!CURATOR_PUBKEY,
      loading: !!CURATOR_PUBKEY && !eose && !latest,
      tutors,
      latest,
      isApproved: (pubkey: string) => !!CURATOR_PUBKEY && tutors.has(pubkey),
    };
  }, [events, eose]);
}

/** Curator-only: add or remove someone from the approved-tutor list. */
export function useTutorAdmin() {
  const { ndk } = useNDK();
  const me = useNDKCurrentUser();
  const { latest, tutors } = useApprovedTutors();
  const isCurator = !!me && me.pubkey === CURATOR_PUBKEY;

  const setApproved = useCallback(
    async (pubkey: string, approved: boolean) => {
      if (!ndk || !isCurator) return;
      const next = new Set(tutors);
      if (approved) next.add(pubkey);
      else next.delete(pubkey);
      const e = new NDKEvent(ndk);
      e.kind = KIND.FollowSet;
      e.content = '';
      e.tags = [
        ['d', TUTOR_LIST_D],
        ['title', 'Bluey approved tutors'],
        // keep anything else the list carries; only the p tags are rewritten
        ...(latest?.tags.filter((t) => !['d', 'title', 'p'].includes(t[0])) ?? []),
        ...[...next].map((pk) => ['p', pk]),
      ];
      await e.publish();
    },
    [ndk, isCurator, latest, tutors],
  );

  return { isCurator, setApproved };
}

/**
 * Send a tutor application to the curator as a NIP-17 private message: an
 * unsigned kind 14 rumor, sealed and gift-wrapped so only the curator can read it.
 */
export function useApplyToTeach() {
  const { ndk } = useNDK();
  const me = useNDKCurrentUser();

  return useCallback(
    async (text: string) => {
      if (!ndk?.signer || !me) throw new Error('Sign in first');
      if (!CURATOR_PUBKEY) throw new Error('Applications are not open yet');
      const rumor = new NDKEvent(ndk, {
        kind: KIND.PrivateDM,
        content: text,
        pubkey: me.pubkey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['p', CURATOR_PUBKEY],
          ['subject', 'Bluey tutor application'],
        ],
      });
      const wrapped = await giftWrap(rumor, new NDKUser({ pubkey: CURATOR_PUBKEY }), ndk.signer);
      await wrapped.publish();
    },
    [ndk, me],
  );
}
