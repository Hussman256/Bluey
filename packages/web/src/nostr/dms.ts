import { NDKEvent, NDKRelaySet, NDKUser, giftUnwrap, giftWrap } from '@nostr-dev-kit/ndk';
import type NDK from '@nostr-dev-kit/ndk';
import type { NDKSubscription } from '@nostr-dev-kit/ndk';
import { useNDK, useNDKCurrentUser } from '@nostr-dev-kit/react';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { collectEvents } from './collectEvents';
import { DEFAULT_RELAYS, LS, RELAYS_OVERRIDDEN, loadRelayList } from './config';
import { KIND } from './kinds';

/**
 * NIP-17 private messages. Each message is an unsigned kind 14 "rumor", sealed
 * (kind 13, signed by the sender, encrypted to the recipient) and gift-wrapped
 * (kind 1059, signed by a throwaway key). Relays see only the recipient. Every
 * message is wrapped once per recipient and once more for the sender, so your
 * own copy comes back to you on any device.
 *
 * Messages go to the recipient's inbox relays (kind 10050). With VITE_RELAYS set,
 * everything stays on the test relays.
 */

export interface DmMessage {
  /** rumor id */
  id: string;
  from: string;
  /** everyone in the conversation except me; [me] for notes to self */
  peers: string[];
  content: string;
  created_at: number;
  status?: 'sending' | 'failed';
}

export const conversationKey = (peers: string[]) => [...new Set(peers)].sort().join(',');

const isPublicRelay = (url: string) => RELAYS_OVERRIDDEN || url.startsWith('wss://');
const MAX_INBOX = 3;

/* ---------- inbox relays (kind 10050) ---------- */

async function newest(ndk: NDK, kind: number, pubkey: string) {
  const { events, complete } = await collectEvents(ndk, { kinds: [kind], authors: [pubkey] }, { maxMs: 5000 });
  const best = events.reduce<NDKEvent | null>(
    (a, e) => (!a || (e.created_at ?? 0) > (a.created_at ?? 0) ? e : a),
    null,
  );
  return { event: best, complete };
}

const inboxCache = new Map<string, Promise<string[]>>();

/**
 * Where to deliver someone's messages: their kind 10050 list, else the relays
 * they read from (NIP-65) plus ours, so Bluey people without a list still get them.
 */
export function inboxRelays(ndk: NDK, pubkey: string): Promise<string[]> {
  if (RELAYS_OVERRIDDEN) return Promise.resolve(DEFAULT_RELAYS);
  let p = inboxCache.get(pubkey);
  if (!p) {
    p = (async () => {
      const dm = await newest(ndk, KIND.DMRelays, pubkey);
      const listed = (dm.event?.tags ?? []).filter((t) => t[0] === 'relay' && t[1]).map((t) => t[1]);
      if (listed.length) return [...new Set(listed.filter(isPublicRelay))];
      const nip65 = await newest(ndk, KIND.RelayList, pubkey);
      const reads = (nip65.event?.tags ?? [])
        .filter((t) => t[0] === 'r' && t[1] && (!t[2] || t[2] === 'read'))
        .map((t) => t[1])
        .filter(isPublicRelay)
        .slice(0, 4);
      return [...new Set([...reads, ...DEFAULT_RELAYS])];
    })();
    inboxCache.set(pubkey, p);
    p.catch(() => inboxCache.delete(pubkey));
  }
  return p;
}

function syncedPubkeys(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LS.dmRelaysSynced) ?? '[]');
    return Array.isArray(raw) ? (raw as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Publish an inbox-relay list once, only for people who have none, so other
 * apps know where to send them messages. An existing list is never touched.
 */
export async function syncDmRelays(ndk: NDK, pubkey: string) {
  const synced = syncedPubkeys();
  if (synced.includes(pubkey)) return;
  const ours = loadRelayList().filter(isPublicRelay).slice(0, MAX_INBOX);
  if (!ours.length || ndk.pool.connectedRelays().length < Math.min(2, ours.length)) return;

  const existing = await newest(ndk, KIND.DMRelays, pubkey);
  if (!existing.complete) return; // couldn't tell; try next session
  if (!existing.event) {
    const ev = new NDKEvent(ndk);
    ev.kind = KIND.DMRelays;
    ev.content = '';
    ev.tags = ours.map((url) => ['relay', url]);
    await ev.publish();
  }
  inboxCache.delete(pubkey);
  localStorage.setItem(LS.dmRelaysSynced, JSON.stringify([...synced, pubkey]));
}

/* ---------- signer support ---------- */

/** Private messages need NIP-44 encryption. Extensions that only do NIP-04 can't. */
export function useCanMessage(): boolean | null {
  const { ndk } = useNDK();
  const signer = ndk?.signer;
  const [result, setResult] = useState<{ signer: unknown; ok: boolean } | null>(null);
  useEffect(() => {
    if (!signer?.encryptionEnabled) return;
    let cancelled = false;
    signer
      .encryptionEnabled('nip44')
      .then((s) => !cancelled && setResult({ signer, ok: s.includes('nip44') }))
      .catch(() => !cancelled && setResult({ signer, ok: false }));
    return () => {
      cancelled = true;
    };
  }, [signer]);
  if (!signer?.encryptionEnabled) return false;
  return result?.signer === signer ? result.ok : null;
}

/* ---------- the inbox ---------- */

/**
 * One inbox per signed-in account, kept for the whole session so moving between
 * pages doesn't decrypt everything again. It starts the first time a Messages
 * page opens, because unwrapping can ask a signer extension for permission.
 */
class Inbox {
  readonly messages = new Map<string, DmMessage>();
  private seenWraps = new Set<string>();
  private queue: NDKEvent[] = [];
  private draining = false;
  private subs: NDKSubscription[] = [];
  private listeners = new Set<() => void>();
  private notifyTimer: ReturnType<typeof setTimeout> | undefined;
  /** replaced on every change, so React can compare it by reference */
  snapshot: { messages: DmMessage[]; loading: boolean; unreadable: number } = {
    messages: [],
    loading: true,
    unreadable: 0,
  };
  loading = true;
  unreadable = 0;

  private ndk: NDK;
  readonly me: string;

  constructor(ndk: NDK, me: string) {
    this.ndk = ndk;
    this.me = me;
  }

  start() {
    const filter = { kinds: [KIND.GiftWrap], '#p': [this.me], limit: 1000 };
    const stopLoading = () => {
      if (!this.loading) return;
      this.loading = false;
      this.notify();
    };
    const limit = setTimeout(stopLoading, 10_000);
    const onEvent = (e: NDKEvent) => this.enqueue(e);

    this.subs.push(
      this.ndk.subscribe(filter, {
        closeOnEose: false,
        onEvent,
        onEose: () => {
          clearTimeout(limit);
          // let the queue finish what arrived before calling it loaded
          const wait = () => (this.draining || this.queue.length ? setTimeout(wait, 200) : stopLoading());
          wait();
        },
      }),
    );

    // also listen on my own inbox relays if they're not already in the pool
    void inboxRelays(this.ndk, this.me).then((urls) => {
      const norm = (u: string) => u.replace(/\/+$/, '');
      const known = new Set(this.ndk.pool.connectedRelays().map((r) => norm(r.url)));
      const extra = urls.filter((u) => !known.has(norm(u)));
      if (!extra.length) return;
      this.subs.push(
        this.ndk.subscribe(filter, { closeOnEose: false, onEvent, relaySet: NDKRelaySet.fromRelayUrls(extra, this.ndk) }),
      );
    });
  }

  stop() {
    this.subs.forEach((s) => s.stop());
    this.subs = [];
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private notify() {
    clearTimeout(this.notifyTimer);
    this.notifyTimer = setTimeout(() => {
      this.snapshot = { messages: [...this.messages.values()], loading: this.loading, unreadable: this.unreadable };
      this.listeners.forEach((l) => l());
    }, 50);
  }

  private enqueue(e: NDKEvent) {
    if (this.seenWraps.has(e.id)) return;
    this.seenWraps.add(e.id);
    this.queue.push(e);
    void this.drain();
  }

  /** One at a time: a signer extension may show a prompt per decryption. */
  private async drain() {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length) {
        const wrap = this.queue.shift()!;
        try {
          const rumor = await giftUnwrap(wrap);
          if (rumor.kind !== KIND.PrivateDM) continue;
          const tagged = rumor.tags.filter((t) => t[0] === 'p' && /^[0-9a-f]{64}$/.test(t[1] ?? '')).map((t) => t[1]);
          const everyone = new Set([rumor.pubkey, ...tagged]);
          // a message must involve me, either as sender or as a tagged recipient
          if (!everyone.has(this.me)) continue;
          everyone.delete(this.me);
          this.add({
            id: rumor.id,
            from: rumor.pubkey,
            peers: everyone.size ? [...everyone] : [this.me],
            content: rumor.content,
            created_at: rumor.created_at ?? 0,
          });
        } catch {
          this.unreadable++;
        }
      }
    } finally {
      this.draining = false;
    }
  }

  add(m: DmMessage) {
    const had = this.messages.get(m.id);
    if (had && !had.status) return;
    this.messages.set(m.id, m);
    this.notify();
  }

  remove(id: string) {
    if (this.messages.delete(id)) this.notify();
  }

  setStatus(id: string, status: DmMessage['status']) {
    const m = this.messages.get(id);
    if (!m) return;
    this.messages.set(id, { ...m, status });
    this.notify();
  }
}

let current: Inbox | null = null;

function inboxFor(ndk: NDK, me: string): Inbox {
  if (current?.me !== me) {
    current?.stop();
    current = new Inbox(ndk, me);
    current.start();
  }
  return current;
}

export interface Conversation {
  key: string;
  peers: string[];
  messages: DmMessage[];
  last: DmMessage;
  /** I've sent at least one message here */
  replied: boolean;
}

function group(messages: Iterable<DmMessage>, me: string): Conversation[] {
  const by = new Map<string, DmMessage[]>();
  for (const m of messages) {
    const key = conversationKey(m.peers);
    const list = by.get(key);
    if (list) list.push(m);
    else by.set(key, [m]);
  }
  return [...by.entries()]
    .map(([key, list]) => {
      list.sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id));
      return {
        key,
        peers: list[0].peers,
        messages: list,
        last: list[list.length - 1],
        replied: list.some((m) => m.from === me),
      };
    })
    .sort((a, b) => b.last.created_at - a.last.created_at);
}

/** All conversations for the signed-in account, newest first. Starts the inbox. */
export function useInbox(enabled = true) {
  const { ndk } = useNDK();
  const me = useNDKCurrentUser();
  const inbox = enabled && ndk && me ? inboxFor(ndk, me.pubkey) : null;
  const snap = useSyncExternalStore(inbox?.subscribe ?? noopSubscribe, () => inbox?.snapshot ?? EMPTY);
  const mine = inbox?.me ?? '';
  const conversations = useMemo(() => group(snap.messages, mine), [snap.messages, mine]);
  return { conversations, loading: snap.loading, unreadable: snap.unreadable };
}

const noopSubscribe = () => () => undefined;
const EMPTY = { messages: [] as DmMessage[], loading: false, unreadable: 0 };

/* ---------- sending ---------- */

/**
 * Send a message to everyone in `peers`. It shows at once as "sending" and turns
 * "failed" if no inbox relay of any recipient accepted it. Your own copy is
 * best-effort: if it doesn't land, other devices just won't see it.
 */
export async function sendMessage(ndk: NDK, me: string, peers: string[], text: string) {
  const content = text.trim();
  if (!content) return;
  const inbox = inboxFor(ndk, me);
  const recipients = [...new Set(peers)].filter((p) => p !== me);

  const rumor = new NDKEvent(ndk, {
    kind: KIND.PrivateDM,
    content,
    pubkey: me,
    created_at: Math.floor(Date.now() / 1000),
    tags: (recipients.length ? recipients : [me]).map((p) => ['p', p]),
  });
  rumor.id = rumor.getEventHash();

  const msg: DmMessage = {
    id: rumor.id,
    from: me,
    peers: recipients.length ? recipients : [me],
    content,
    created_at: rumor.created_at!,
    status: 'sending',
  };
  inbox.add(msg);

  const deliver = async (to: string) => {
    const wrapped = await giftWrap(rumor, new NDKUser({ pubkey: to }), ndk.signer);
    const relays = await inboxRelays(ndk, to);
    const accepted = await wrapped.publish(NDKRelaySet.fromRelayUrls(relays, ndk), 10_000, 1);
    if (!accepted.size) throw new Error('no relay accepted the message');
  };

  // every recipient must get it (a note to self has only my copy)
  try {
    await Promise.all((recipients.length ? recipients : [me]).map(deliver));
    inbox.setStatus(msg.id, undefined);
  } catch {
    inbox.setStatus(msg.id, 'failed');
    return;
  }
  // my own copy is best-effort and never holds up or fails the send
  if (recipients.length) void deliver(me).catch(() => undefined);
}

/** Drop a failed message and send its text again as a new one. */
export function retryMessage(ndk: NDK, me: string, m: DmMessage) {
  inboxFor(ndk, me).remove(m.id);
  return sendMessage(ndk, me, m.peers, m.content);
}

/* ---------- read markers (timestamps only, never content) ---------- */

function loadRead(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(LS.dmRead) ?? '{}');
    return raw && typeof raw === 'object' ? (raw as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function markRead(me: string, key: string, ts: number) {
  const all = loadRead();
  const id = `${me}:${key}`;
  if ((all[id] ?? 0) >= ts) return;
  all[id] = ts;
  try {
    localStorage.setItem(LS.dmRead, JSON.stringify(all));
  } catch {
    /* private mode */
  }
}

export function isUnread(me: string, c: Conversation): boolean {
  if (c.last.from === me) return false;
  return c.last.created_at > (loadRead()[`${me}:${c.key}`] ?? 0);
}
