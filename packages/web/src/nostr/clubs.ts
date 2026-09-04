import { KIND } from '@1btc/shared';
import NDK, { NDKEvent, NDKRelaySet, NDKRelayAuthPolicies } from '@nostr-dev-kit/ndk';
import { useNDK } from '@nostr-dev-kit/react';
import { useEffect, useMemo } from 'react';

export const CLUBS_RELAY =
  (import.meta.env.VITE_CLUBS_RELAY as string | undefined) || 'ws://localhost:8788';

const wired = new WeakSet<object>();

/** Ensure NDK is connected + NIP-42 authing to the clubs relay; return a scoped relay set. */
export function useClubsRelaySet(): NDKRelaySet | null {
  const { ndk } = useNDK();

  useEffect(() => {
    if (!ndk || wired.has(ndk)) return;
    wired.add(ndk);
    // one-time imperative setup of the NDK singleton
    // oxlint-disable-next-line react/immutability
    ndk.relayAuthDefaultPolicy = NDKRelayAuthPolicies.signIn({ ndk });
    ndk.addExplicitRelay(CLUBS_RELAY, NDKRelayAuthPolicies.signIn({ ndk }), true);
  }, [ndk]);

  return useMemo(() => (ndk ? NDKRelaySet.fromRelayUrls([CLUBS_RELAY], ndk) : null), [ndk]);
}

// ---------- event builders ----------
function ev(ndk: NDK, kind: number, tags: string[][], content = '') {
  const e = new NDKEvent(ndk);
  e.kind = kind;
  e.tags = tags;
  e.content = content;
  return e;
}

export const newGroupId = () =>
  'c' + crypto.getRandomValues(new Uint8Array(6)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '');

export const createGroupEvent = (ndk: NDK, id: string, name: string) =>
  ev(ndk, KIND.GroupCreate, [
    ['h', id],
    ['name', name],
  ]);

export const editMetadataEvent = (
  ndk: NDK,
  id: string,
  fields: { name?: string; about?: string; picture?: string },
) =>
  ev(ndk, KIND.GroupEditMetadata, [
    ['h', id],
    ...Object.entries(fields).filter(([, v]) => v != null && v !== '') as string[][],
  ]);

export const joinGroupEvent = (ndk: NDK, id: string) => ev(ndk, KIND.GroupJoinRequest, [['h', id]]);
export const leaveGroupEvent = (ndk: NDK, id: string) => ev(ndk, KIND.GroupLeaveRequest, [['h', id]]);
export const chatEvent = (ndk: NDK, id: string, text: string) =>
  ev(ndk, KIND.GroupChatMessage, [['h', id]], text);
export const addUserEvent = (ndk: NDK, id: string, pubkey: string, role: 'member' | 'admin' = 'member') =>
  ev(ndk, KIND.GroupAddUser, [
    ['h', id],
    ['p', pubkey, role],
  ]);
export const removeUserEvent = (ndk: NDK, id: string, pubkey: string) =>
  ev(ndk, KIND.GroupRemoveUser, [
    ['h', id],
    ['p', pubkey],
  ]);

// ---------- parsers ----------
export interface ClubMeta {
  id: string;
  name: string;
  about?: string;
  picture?: string;
  open: boolean;
  isPublic: boolean;
}

export function parseClubMeta(e: NDKEvent): ClubMeta | null {
  const id = e.tags.find((t) => t[0] === 'd')?.[1];
  if (!id) return null;
  const tag = (n: string) => e.tags.find((t) => t[0] === n)?.[1];
  return {
    id,
    name: tag('name') ?? 'Untitled club',
    about: tag('about'),
    picture: tag('picture'),
    open: e.tags.some((t) => t[0] === 'open'),
    isPublic: e.tags.some((t) => t[0] === 'public'),
  };
}

export const parsePubkeyList = (e?: NDKEvent): string[] =>
  e ? e.tags.filter((t) => t[0] === 'p').map((t) => t[1]) : [];
