/**
 * 1btc index-service wire protocol.
 *
 * A thin request/response layer over one WebSocket. The client sends a Request;
 * the server streams zero or more Frames tagged with the same `id`, ending with
 * a frame where `done: true`. Events are raw Nostr events so the client can hand
 * them straight to NDK.
 */

export interface NostrEventLike {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export type RequestMethod =
  | 'feed' // trending / discover feed, web-of-trust weighted
  | 'thread' // a root event + its replies
  | 'profile' // kind 0 + counts for a pubkey
  | 'notes' // NIP-23 long-form feed
  | 'notifications' // mentions / reactions / reposts / zaps touching a pubkey
  | 'search' // full-text over note content
  | 'counts' // engagement counts for a set of event ids
  | 'wot'; // web-of-trust score for a pubkey (0..1)

export interface FeedParams {
  scope: 'discover' | 'following';
  pubkey?: string; // viewer, for WoT weighting + following set
  limit?: number;
  until?: number; // paginate: created_at cursor
}
export interface ThreadParams {
  id: string;
  limit?: number;
}
export interface ProfileParams {
  pubkey: string;
}
export interface NotesParams {
  pubkey?: string;
  scope?: 'all' | 'following';
  limit?: number;
  until?: number;
}
export interface NotificationsParams {
  pubkey: string;
  since?: number;
  limit?: number;
}
export interface SearchParams {
  q: string;
  limit?: number;
}
export interface CountsParams {
  ids: string[];
}
export interface WotParams {
  pubkey: string;
  from?: string; // seed viewer
}

export interface Request {
  id: string;
  method: RequestMethod;
  params:
    | FeedParams
    | ThreadParams
    | ProfileParams
    | NotesParams
    | NotificationsParams
    | SearchParams
    | CountsParams
    | WotParams;
}

export interface EngagementCount {
  id: string;
  replies: number;
  reactions: number;
  reposts: number;
  zapCount: number;
  zapSats: number;
}

export interface NotificationItem {
  id: string; // the triggering event id
  kind: number; // 1 (reply/mention) | 7 | 6 | 9735
  pubkey: string; // who did it
  created_at: number;
  targetId?: string; // your note they acted on
  zapSats?: number;
  contentPreview?: string;
}

export interface Frame {
  id: string;
  events?: NostrEventLike[];
  counts?: EngagementCount[];
  notifications?: NotificationItem[];
  score?: number;
  error?: string;
  done: boolean;
}

export const DEFAULT_INDEX_URL = 'ws://localhost:8787';
