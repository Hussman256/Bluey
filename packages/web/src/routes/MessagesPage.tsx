import { useFollows, useNDK, useNDKCurrentUser, useProfileValue } from '@nostr-dev-kit/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { RelativeTime } from '../components/primitives';
import { NoteContent } from '../nostr/content';
import {
  type Conversation,
  conversationKey,
  isUnread,
  markRead,
  retryMessage,
  sendMessage,
  useCanMessage,
  useInbox,
} from '../nostr/dms';
import { npubOf, pubkeyFrom, shortNpub } from '../nostr/ids';
import { useMuteActions } from '../nostr/mutes';
import { personLabel, useMentionSearch } from '../nostr/useMentionSearch';

/* ---------- small pieces ---------- */

/** Avatar without a link, for use inside rows that are already links. */
function Face({ pubkey, size = 44 }: { pubkey: string; size?: number }) {
  const profile = useProfileValue(pubkey);
  return profile?.picture ? (
    <img
      src={profile.picture}
      alt=""
      loading="lazy"
      className="shrink-0 rounded-full bg-sunk object-cover"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-brand-soft font-mono text-xs text-brand-ink"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {(profile?.name ?? '?').slice(0, 2)}
    </span>
  );
}

function useName(pubkey: string | undefined) {
  const profile = useProfileValue(pubkey);
  return profile?.displayName || profile?.name || (pubkey ? shortNpub(pubkey) : '');
}

function Name({ pubkey }: { pubkey: string }) {
  return <>{useName(pubkey)}</>;
}

function Names({ peers }: { peers: string[] }) {
  return (
    <>
      {peers.slice(0, 3).map((p, i) => (
        <span key={p}>
          {i > 0 && ', '}
          <Name pubkey={p} />
        </span>
      ))}
      {peers.length > 3 && ` +${peers.length - 3}`}
    </>
  );
}

const pathFor = (peers: string[]) => `/messages/${peers.map(npubOf).join(',')}`;

function SignerNotice() {
  return (
    <p className="mx-4 my-4 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink-soft">
      The way you signed in can't open private messages. They need NIP-44 encryption: update your
      signer extension, or sign in another way.
    </p>
  );
}

const PRIVACY =
  'Messages are end-to-end encrypted (NIP-17). Relays can see who receives a message, but not who sent it or what it says.';

/* ---------- inbox ---------- */

function NewMessage({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const direct = pubkeyFrom(q.trim());
  const people = useMentionSearch(!direct && q.trim().length >= 2 ? q.trim() : null);

  return (
    <div className="border-b border-line px-4 py-3">
      <div className="flex gap-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name or npub"
          aria-label="Who to message"
          className="min-w-0 flex-1 rounded-full border border-line-strong bg-surface px-4 py-2 text-sm outline-none focus:border-brand"
        />
        <button type="button" onClick={onClose} className="px-2 text-sm text-ink-faint hover:text-ink">
          Cancel
        </button>
      </div>
      <ul className="mt-2">
        {direct && (
          <li>
            <Link to={pathFor([direct])} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface">
              <Face pubkey={direct} size={36} />
              <span className="truncate text-sm font-semibold">
                <Name pubkey={direct} />
              </span>
            </Link>
          </li>
        )}
        {people.map((p) => (
          <li key={p.pubkey}>
            <button
              type="button"
              onClick={() => navigate(pathFor([p.pubkey]))}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface"
            >
              <Face pubkey={p.pubkey} size={36} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{personLabel(p)}</span>
                {p.nip05 && <span className="block truncate text-xs text-ink-faint">{p.nip05}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ c, me }: { c: Conversation; me: string }) {
  const unread = isUnread(me, c);
  return (
    <li>
      <Link to={pathFor(c.peers)} className="flex items-center gap-3 px-4 py-3 hover:bg-surface">
        <Face pubkey={c.peers[0]} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className={`min-w-0 flex-1 truncate text-[15px] ${unread ? 'font-bold' : 'font-semibold'}`}>
              {c.peers[0] === me ? 'Notes to self' : <Names peers={c.peers} />}
            </span>
            <span className="shrink-0 text-xs text-ink-faint">
              <RelativeTime ts={c.last.created_at} />
            </span>
          </div>
          <p className={`truncate text-sm ${unread ? 'text-ink' : 'text-ink-faint'}`}>
            {c.last.from === me && 'You: '}
            {c.last.content}
          </p>
        </div>
        {unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-brand" aria-label="unread" />}
      </Link>
    </li>
  );
}

export function MessagesPage() {
  const me = useNDKCurrentUser();
  const follows = useFollows();
  const { mutes } = useMuteActions();
  const canMessage = useCanMessage();
  const { conversations, loading, unreadable } = useInbox(canMessage === true);
  const [tab, setTab] = useState<'chats' | 'requests'>('chats');
  const [composing, setComposing] = useState(false);

  const { chats, requests } = useMemo(() => {
    const visible = conversations.filter((c) => !c.peers.every((p) => mutes.pubkeys.includes(p)));
    const known = (c: Conversation) => c.replied || c.peers.some((p) => p === me?.pubkey || follows.has(p));
    return { chats: visible.filter(known), requests: visible.filter((c) => !known(c)) };
  }, [conversations, mutes.pubkeys, follows, me?.pubkey]);

  if (!me) return null;
  const list = tab === 'chats' ? chats : requests;

  return (
    <div>
      <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
        <div className="flex items-center gap-2.5 px-4 pb-2 pt-3.5 sm:px-5">
          <h1 className="flex-1 font-display text-2xl font-extrabold tracking-tight sm:text-xl">Messages</h1>
          {canMessage && (
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="rounded-full bg-brand px-4 py-1.5 text-sm font-bold text-white hover:opacity-90"
            >
              New
            </button>
          )}
        </div>
        {canMessage && (
          <div className="flex gap-1.5 px-4 pb-2.5">
            {(['chats', 'requests'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${
                  tab === t ? 'bg-ink text-bg' : 'text-ink-faint hover:bg-surface hover:text-ink'
                }`}
              >
                {t === 'chats' ? 'Chats' : `Requests${requests.length ? ` (${requests.length})` : ''}`}
              </button>
            ))}
          </div>
        )}
      </header>

      {canMessage === false && <SignerNotice />}
      {composing && <NewMessage onClose={() => setComposing(false)} />}

      {canMessage && (
        <>
          {tab === 'requests' && (
            <p className="px-4 pt-3 text-xs text-ink-faint">
              From people you don't follow. Replying moves a conversation to Chats.
            </p>
          )}
          <ul className="py-1">
            {list.map((c) => (
              <Row key={c.key} c={c} me={me.pubkey} />
            ))}
          </ul>
          {list.length === 0 && (
            <p className="px-6 py-10 text-center font-mono text-xs text-ink-faint">
              {loading
                ? 'opening your messages…'
                : tab === 'chats'
                  ? 'no conversations yet. Start one with New, or from someone’s profile.'
                  : 'no requests'}
            </p>
          )}
          {!loading && unreadable > 0 && (
            <p className="px-6 pb-2 text-center text-xs text-ink-faint">
              {unreadable} message{unreadable === 1 ? '' : 's'} couldn't be opened.
            </p>
          )}
          <p className="px-6 pb-8 pt-2 text-center text-xs text-ink-faint">{PRIVACY}</p>
        </>
      )}
    </div>
  );
}

/* ---------- one conversation ---------- */

export function ConversationPage() {
  const { peers: param } = useParams();
  const { ndk } = useNDK();
  const me = useNDKCurrentUser();
  const follows = useFollows();
  const { mutePubkey } = useMuteActions();
  const navigate = useNavigate();
  const canMessage = useCanMessage();
  const { conversations, loading } = useInbox(canMessage === true);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const peers = useMemo(() => {
    const list = (param ?? '').split(',').map((s) => pubkeyFrom(s.trim()));
    return list.every(Boolean) && list.length ? [...new Set(list as string[])] : null;
  }, [param]);
  const key = peers ? conversationKey(peers) : '';
  const convo = conversations.find((c) => c.key === key);
  const messages = convo?.messages ?? [];
  const last = convo?.last.created_at ?? 0;
  const toSelf = !!me && peers?.length === 1 && peers[0] === me.pubkey;
  const firstPeerName = useName(peers?.[0]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  useEffect(() => {
    if (me && key && last) markRead(me.pubkey, key, last);
  }, [me, key, last]);

  if (!me) return null;
  if (!peers) {
    return <p className="px-4 py-10 text-center text-sm text-ink-soft">That conversation link isn't valid.</p>;
  }

  const isRequest =
    !!convo && !convo.replied && !toSelf && !peers.some((p) => follows.has(p));

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!ndk || !me || !peers || !text.trim()) return;
    const msg = text;
    setText('');
    await sendMessage(ndk, me.pubkey, peers, msg);
  }

  return (
    <div className="flex h-[calc(100dvh-5.5rem-env(safe-area-inset-bottom))] flex-col sm:h-[calc(100dvh-2rem)]">
      <header className="flex items-center gap-3 border-b border-line bg-bg px-4 py-3">
        <Link to="/messages" className="text-ink-faint hover:text-ink" aria-label="All messages">
          ←
        </Link>
        <Link to={`/p/${npubOf(peers[0])}`} className="flex min-w-0 flex-1 items-center gap-3">
          <Face pubkey={peers[0]} size={36} />
          <span className="truncate font-display font-semibold">
            {toSelf ? 'Notes to self' : <Names peers={peers} />}
          </span>
        </Link>
      </header>

      {canMessage === false ? (
        <SignerNotice />
      ) : (
        <>
          <div className="flex-1 overflow-y-auto">
            {messages.length === 0 && (
              <div className="px-6 py-10 text-center">
                <p className="font-mono text-xs text-ink-faint">
                  {loading && canMessage ? 'opening your messages…' : 'no messages yet. Say hello.'}
                </p>
                <p className="mt-3 text-xs text-ink-faint">{PRIVACY}</p>
              </div>
            )}
            <ul className="flex flex-col gap-1.5 px-3 py-3">
              {messages.map((m) => {
                const mine = m.from === me.pubkey;
                return (
                  <li key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                    {!mine && peers.length > 1 && (
                      <span className="px-3 text-[11px] text-ink-faint">
                        <Name pubkey={m.from} />
                      </span>
                    )}
                    <div
                      className={`max-w-[80%] break-words rounded-2xl px-3.5 py-2 text-sm ${
                        mine ? 'rounded-br-md bg-brand text-white' : 'rounded-bl-md bg-surface'
                      } ${m.status === 'sending' ? 'opacity-60' : ''}`}
                    >
                      {mine ? <span className="whitespace-pre-wrap">{m.content}</span> : <NoteContent content={m.content} small />}
                    </div>
                    <span className="px-2 pt-0.5 text-[10px] text-ink-faint">
                      {m.status === 'failed' ? (
                        <button
                          type="button"
                          onClick={() => ndk && void retryMessage(ndk, me.pubkey, m)}
                          className="font-semibold text-danger hover:underline"
                        >
                          Not sent. Retry
                        </button>
                      ) : m.status === 'sending' ? (
                        'sending…'
                      ) : (
                        <RelativeTime ts={m.created_at} />
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div ref={endRef} />
          </div>

          {isRequest && (
            <div className="flex items-center gap-3 border-t border-line bg-surface px-4 py-2.5 text-xs text-ink-soft">
              <span className="flex-1">You don't follow {firstPeerName}. Reply to accept this conversation.</span>
              <button
                type="button"
                onClick={() => {
                  void Promise.all(peers.map((p) => mutePubkey(p)));
                  navigate('/messages');
                }}
                className="rounded-full border border-line-strong px-3 py-1 font-semibold hover:border-danger hover:text-danger"
              >
                Mute
              </button>
            </div>
          )}

          <form onSubmit={send} className="flex items-end gap-2 border-t border-line bg-bg px-4 py-3">
            <textarea
              value={text}
              rows={1}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
              disabled={!canMessage}
              placeholder={toSelf ? 'Write a note to yourself…' : `Message ${firstPeerName}…`}
              aria-label="Message"
              className="max-h-40 min-h-10 flex-1 resize-none rounded-2xl border border-line-strong bg-surface px-4 py-2 text-sm outline-none focus:border-brand"
            />
            <button
              type="submit"
              disabled={!canMessage || !text.trim()}
              className="h-10 rounded-full bg-brand px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </>
      )}
    </div>
  );
}
