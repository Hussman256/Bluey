import { KIND } from '@1btc/shared';
import type { NDKEvent } from '@nostr-dev-kit/ndk';
import { useNDK, useNDKCurrentUser, useSubscribe } from '@nostr-dev-kit/react';
import { useCallback, useMemo } from 'react';
import {
  addUserEvent,
  chatEvent,
  createGroupEvent,
  editMetadataEvent,
  joinGroupEvent,
  leaveGroupEvent,
  newGroupId,
  parseClubMeta,
  parsePubkeyList,
  removeUserEvent,
  useClubsRelaySet,
  type ClubMeta,
} from './clubs';

export function useClubList(): { clubs: ClubMeta[]; loading: boolean } {
  const relaySet = useClubsRelaySet();
  const { events, eose } = useSubscribe(
    relaySet ? [{ kinds: [KIND.GroupMetadata], limit: 200 }] : false,
    { relaySet: relaySet ?? undefined, closeOnEose: false },
    [!!relaySet],
  );
  const clubs = useMemo(
    () =>
      events
        .map(parseClubMeta)
        .filter((c): c is ClubMeta => !!c)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [events],
  );
  return { clubs, loading: !eose && clubs.length === 0 };
}

export function useClub(id: string | undefined) {
  const relaySet = useClubsRelaySet();
  const me = useNDKCurrentUser();

  const { events: metaEvents } = useSubscribe(
    relaySet && id
      ? [{ kinds: [KIND.GroupMetadata, KIND.GroupAdmins, KIND.GroupMembers], '#d': [id] }]
      : false,
    { relaySet: relaySet ?? undefined, closeOnEose: false },
    [id, !!relaySet],
  );

  return useMemo(() => {
    const meta = metaEvents.find((e) => e.kind === KIND.GroupMetadata);
    const members = parsePubkeyList(metaEvents.find((e) => e.kind === KIND.GroupMembers));
    const admins = parsePubkeyList(metaEvents.find((e) => e.kind === KIND.GroupAdmins));
    return {
      meta: meta ? parseClubMeta(meta) : null,
      members,
      admins,
      isMember: me ? members.includes(me.pubkey) : false,
      isAdmin: me ? admins.includes(me.pubkey) : false,
    };
  }, [metaEvents, me]);
}

export function useClubChat(id: string | undefined): NDKEvent[] {
  const relaySet = useClubsRelaySet();
  const { events } = useSubscribe(
    relaySet && id ? [{ kinds: [KIND.GroupChatMessage], '#h': [id], limit: 300 }] : false,
    { relaySet: relaySet ?? undefined, closeOnEose: false },
    [id, !!relaySet],
  );
  return useMemo(
    () => events.slice().sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0)),
    [events],
  );
}

export function useClubActions() {
  const { ndk } = useNDK();
  const relaySet = useClubsRelaySet();

  const publish = useCallback(
    async (e: NDKEvent) => {
      if (!relaySet) throw new Error('clubs relay not ready');
      await e.publish(relaySet);
    },
    [relaySet],
  );

  return useMemo(
    () => ({
      async create(name: string, about?: string): Promise<string> {
        if (!ndk) throw new Error('not ready');
        const id = newGroupId();
        await publish(createGroupEvent(ndk, id, name));
        if (about) await publish(editMetadataEvent(ndk, id, { about }));
        return id;
      },
      edit: (id: string, fields: { name?: string; about?: string; picture?: string }) =>
        ndk && publish(editMetadataEvent(ndk, id, fields)),
      join: (id: string) => ndk && publish(joinGroupEvent(ndk, id)),
      leave: (id: string) => ndk && publish(leaveGroupEvent(ndk, id)),
      sendMessage: (id: string, text: string) => ndk && publish(chatEvent(ndk, id, text)),
      addUser: (id: string, pubkey: string, role?: 'member' | 'admin') =>
        ndk && publish(addUserEvent(ndk, id, pubkey, role)),
      removeUser: (id: string, pubkey: string) => ndk && publish(removeUserEvent(ndk, id, pubkey)),
    }),
    [ndk, publish],
  );
}
