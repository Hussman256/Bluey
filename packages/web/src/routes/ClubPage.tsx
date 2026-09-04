import { useNDKCurrentUser } from '@nostr-dev-kit/react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { NoteContent } from '../nostr/content';
import { Avatar, DisplayName, RelativeTime } from '../components/primitives';
import { useClub, useClubActions, useClubChat } from '../nostr/useClubs';

export function ClubPage() {
  const { id } = useParams();
  const me = useNDKCurrentUser();
  const { meta, members, isMember, isAdmin } = useClub(id);
  const chat = useClubChat(isMember ? id : undefined);
  const actions = useClubActions();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [chat.length]);

  async function join() {
    if (!id) return;
    setBusy('join');
    try {
      await actions.join(id);
    } finally {
      setBusy(null);
    }
  }
  async function leave() {
    if (!id) return;
    setBusy('leave');
    try {
      await actions.leave(id);
    } finally {
      setBusy(null);
    }
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !text.trim()) return;
    const msg = text.trim();
    setText('');
    await actions.sendMessage(id, msg);
  }

  if (!id) return null;

  return (
    <div className="flex h-dvh flex-col sm:h-auto">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur">
        <Link to="/clubs" className="text-ink-faint hover:text-ink" aria-label="All clubs">
          ←
        </Link>
        {meta?.picture ? (
          <img src={meta.picture} alt="" className="h-9 w-9 rounded-lg object-cover" />
        ) : (
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-proto-soft font-display text-xs font-bold text-proto">
            {(meta?.name ?? '··').slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-display font-semibold">{meta?.name ?? 'Loading…'}</div>
          <div className="font-mono text-[11px] text-ink-faint">
            {members.length} member{members.length === 1 ? '' : 's'}
          </div>
        </div>
        {me && id && (
          isMember ? (
            <button
              type="button"
              onClick={leave}
              disabled={busy !== null || isAdmin}
              title={isAdmin ? 'owners/admins cannot leave' : undefined}
              className="rounded-full border border-line-strong px-3 py-1.5 text-xs font-semibold hover:border-danger hover:text-danger disabled:opacity-40"
            >
              {busy === 'leave' ? '…' : 'Leave'}
            </button>
          ) : (
            <button
              type="button"
              onClick={join}
              disabled={busy !== null}
              className="rounded-full bg-ink px-3.5 py-1.5 text-xs font-semibold text-bg hover:opacity-90 disabled:opacity-40"
            >
              {busy === 'join' ? '…' : 'Join'}
            </button>
          )
        )}
      </header>

      {meta?.about && (
        <p className="border-b border-line px-4 py-3 text-sm text-ink-soft">{meta.about}</p>
      )}

      {!isMember ? (
        <div className="px-4 py-12 text-center">
          <p className="text-sm text-ink-soft">
            {me ? 'Join this club to see the conversation.' : 'Sign in and join to see the conversation.'}
          </p>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto">
            {chat.length === 0 && (
              <p className="px-4 py-10 text-center font-mono text-xs text-ink-faint">
                no messages yet — say hello
              </p>
            )}
            <ul className="flex flex-col gap-0.5 py-2">
              {chat.map((m) => (
                <li key={m.id} className="flex gap-2.5 px-4 py-1.5">
                  <Avatar pubkey={m.pubkey} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 text-xs">
                      <DisplayName pubkey={m.pubkey} className="text-[13px]" />
                      <RelativeTime ts={m.created_at} />
                    </div>
                    <div className="text-sm">
                      <NoteContent content={m.content} small />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div ref={endRef} />
          </div>

          <form onSubmit={send} className="flex gap-2 border-t border-line bg-bg px-4 py-3">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Message ${meta?.name ?? 'the club'}…`}
              className="flex-1 rounded-full border border-line-strong bg-surface px-4 py-2 text-sm outline-none focus:border-proto"
            />
            <button
              type="submit"
              disabled={!text.trim()}
              className="rounded-full bg-zap px-4 py-2 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </>
      )}
    </div>
  );
}
