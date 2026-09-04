import { useNDKCurrentUser } from '@nostr-dev-kit/react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { NoteContent } from '../nostr/content';
import { Avatar, DisplayName, RelativeTime } from '../components/primitives';
import { addrFromNaddr, naddrOf } from '../nostr/bootcamps';
import {
  useBootcamp,
  useBootcampActions,
  useLiveChat,
  useLiveClass,
} from '../nostr/useBootcamps';
import { useClub } from '../nostr/useClubs';

function StreamEmbed({ url }: { url: string }) {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|live\/)|youtu\.be\/)([\w-]{6,})/);
  const twitch = url.match(/twitch\.tv\/([\w]+)$/);
  if (yt) {
    return (
      <iframe
        title="stream"
        src={`https://www.youtube.com/embed/${yt[1]}`}
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        className="aspect-video w-full rounded-xl border border-line"
      />
    );
  }
  if (twitch) {
    return (
      <iframe
        title="stream"
        src={`https://player.twitch.tv/?channel=${twitch[1]}&parent=${location.hostname}`}
        allowFullScreen
        className="aspect-video w-full rounded-xl border border-line"
      />
    );
  }
  return (
    <video
      src={url}
      controls
      playsInline
      className="aspect-video w-full rounded-xl border border-line bg-black"
    />
  );
}

export function LiveClassPage() {
  const { naddr } = useParams();
  const addr = naddr ? addrFromNaddr(naddr) : null;
  const me = useNDKCurrentUser();
  const live = useLiveClass(addr?.pubkey, addr?.identifier);
  const bootcamp = useBootcamp(live?.bootcampAddr?.pubkey, live?.bootcampAddr?.identifier);
  const cohort = useClub(bootcamp?.cohortId);
  const chat = useLiveChat(live?.addr);
  const actions = useBootcampActions();

  const isTutor = me?.pubkey === live?.pubkey;
  const canWatch = isTutor || cohort.isMember || !bootcamp; // if no cohort, open
  const [text, setText] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [chat.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!live || !text.trim()) return;
    const msg = text.trim();
    setText('');
    await actions.sendLiveChat(live.addr, msg);
  }

  async function status(next: 'live' | 'ended') {
    if (!live) return;
    setBusy(next);
    try {
      await actions.setLiveStatus(live, next, urlInput.trim() || undefined);
    } finally {
      setBusy(null);
    }
  }

  if (!addr) return <p className="p-8 text-center text-sm text-ink-soft">Unknown session.</p>;
  if (!live)
    return <p className="px-4 py-12 text-center font-mono text-xs text-ink-faint">loading…</p>;

  return (
    <div>
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() => history.back()}
          className="text-ink-faint hover:text-ink"
          aria-label="Back"
        >
          ←
        </button>
        <span
          className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase ${
            live.status === 'live'
              ? 'bg-danger/15 text-danger'
              : live.status === 'ended'
                ? 'bg-sunk text-ink-faint'
                : 'bg-proto-soft text-proto'
          }`}
        >
          {live.status}
        </span>
        <span className="truncate font-display font-semibold">{live.title}</span>
      </header>

      <div className="px-4 py-4">
        {!canWatch ? (
          <div className="rounded-xl border border-line bg-surface/50 px-4 py-10 text-center text-sm text-ink-soft">
            Enrol in{' '}
            {bootcamp ? (
              <Link to={`/learn/${naddrOf(bootcamp.addr)}`} className="text-proto hover:underline">
                {bootcamp.title}
              </Link>
            ) : (
              'the bootcamp'
            )}{' '}
            to join this class.
          </div>
        ) : live.streaming ? (
          <StreamEmbed url={live.streaming} />
        ) : (
          <div className="rounded-xl border border-line bg-surface/50 px-4 py-10 text-center text-sm text-ink-soft">
            {live.status === 'ended' ? 'This session has ended.' : 'Waiting for the tutor to go live…'}
          </div>
        )}

        {live.summary && <p className="mt-3 text-sm text-ink-soft">{live.summary}</p>}

        {isTutor && (
          <div className="mt-4 flex flex-col gap-2 rounded-xl border border-line px-3.5 py-3">
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder={live.streaming ?? 'Stream URL (YouTube / Twitch / HLS)'}
              className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 font-mono text-xs outline-none focus:border-proto"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => status('live')}
                disabled={busy !== null || live.status === 'live'}
                className="rounded-full bg-danger/90 px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
              >
                {busy === 'live' ? '…' : 'Go live'}
              </button>
              <button
                type="button"
                onClick={() => status('ended')}
                disabled={busy !== null || live.status === 'ended'}
                className="rounded-full border border-line-strong px-3.5 py-1.5 text-xs font-semibold hover:border-ink disabled:opacity-40"
              >
                {busy === 'ended' ? '…' : 'End session'}
              </button>
            </div>
          </div>
        )}
      </div>

      {canWatch && (
        <div className="border-t border-line">
          <div className="max-h-[24rem] overflow-y-auto">
            {chat.length === 0 && (
              <p className="px-4 py-8 text-center font-mono text-xs text-ink-faint">
                live chat — say hi
              </p>
            )}
            <ul className="flex flex-col gap-0.5 py-2">
              {chat.map((m) => (
                <li key={m.id} className="flex gap-2.5 px-4 py-1">
                  <Avatar pubkey={m.pubkey} size={26} />
                  <div className="min-w-0 flex-1">
                    <span className="text-xs">
                      <DisplayName pubkey={m.pubkey} className="text-[12px]" />{' '}
                      <RelativeTime ts={m.created_at} />
                    </span>
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
              placeholder="Message the class…"
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
        </div>
      )}
    </div>
  );
}
