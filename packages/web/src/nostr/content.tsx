import { nip19 } from '@nostr-dev-kit/ndk';
import { useEvent, useProfileValue } from '@nostr-dev-kit/react';
import { Fragment, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { parseAddr } from './bootcamps';
import { npubOf, shortNpub } from './ids';
import { KIND } from './kinds';
import { SourceTitle } from './sourceTitle';

const IMG_EXT = /\.(png|jpe?g|gif|webp|avif|bmp)(\?\S*)?$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?\S*)?$/i;

// split on urls, nostr: refs, and hashtags while keeping the delimiters
const TOKEN = /(https?:\/\/[^\s]+|nostr:[a-z0-9]+|#[\p{L}\p{N}_]+)/giu;

function MentionName({ pubkey }: { pubkey: string }) {
  const p = useProfileValue(pubkey);
  const name = p?.displayName || p?.name || shortNpub(pubkey);
  return (
    <Link to={`/p/${npubOf(pubkey)}`} className="text-zap-ink hover:underline">
      @{name}
    </Link>
  );
}

function QuoteCard({ id }: { id: string }) {
  const ev = useEvent({ ids: [id] });
  if (!ev) {
    return (
      <div className="my-1 rounded-xl border border-line px-3 py-2 font-mono text-xs text-ink-faint">
        loading quoted note…
      </div>
    );
  }
  if (ev.kind === KIND.Highlight) return <HighlightQuote ev={ev} />;
  return (
    <Link
      to={`/e/${ev.encode()}`}
      className="my-1 block rounded-xl border border-line bg-surface/50 px-3 py-2.5 transition hover:border-line-strong"
    >
      <QuoteHeader pubkey={ev.pubkey} />
      <p className="mt-1 line-clamp-4 whitespace-pre-wrap break-words text-sm text-ink-soft">
        {ev.content}
      </p>
    </Link>
  );
}

/** A quoted NIP-84 highlight: the lifted passage + a link back to its source. */
function HighlightQuote({ ev }: { ev: { content: string; tags: string[][] } }) {
  const src = ev.tags.find((t) => t[0] === 'a')?.[1];
  return (
    <div className="my-1 rounded-xl border border-line bg-surface/50 px-3.5 py-3">
      <p className="mb-1.5 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-ink-faint">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M9 11l3 3 8-8M5 19h14" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Highlight from <SourceTitle source={src ? parseAddr(src) : null} />
      </p>
      <blockquote className="border-l-2 border-zap pl-3 text-sm leading-relaxed text-ink-soft">
        {ev.content}
      </blockquote>
    </div>
  );
}

function QuoteHeader({ pubkey }: { pubkey: string }) {
  const p = useProfileValue(pubkey);
  return (
    <span className="flex items-center gap-1.5 text-xs">
      {p?.picture && (
        <img src={p.picture} alt="" className="h-4 w-4 rounded-full object-cover" />
      )}
      <span className="font-semibold">{p?.displayName || p?.name || shortNpub(pubkey)}</span>
    </span>
  );
}

/** Media hidden behind a click — for NIP-36 content-warning notes. */
function SensitiveMedia({ reason, children }: { reason?: string; children: ReactNode }) {
  const [shown, setShown] = useState(false);
  if (shown) return <div className="space-y-2">{children}</div>;
  return (
    <button
      type="button"
      onClick={() => setShown(true)}
      className="flex w-full flex-col items-center gap-1 rounded-xl border border-line bg-surface px-4 py-8 text-center text-sm text-ink-soft transition hover:border-line-strong"
    >
      <span className="font-semibold">Sensitive content</span>
      <span className="text-xs text-ink-faint">{reason ? `${reason} · ` : ''}tap to view</span>
    </button>
  );
}

/** Render note content: links, media, nostr mentions, quoted notes, hashtags. */
export function NoteContent({
  content,
  small = false,
  sensitive = false,
  sensitiveReason,
}: {
  content: string;
  small?: boolean;
  sensitive?: boolean;
  sensitiveReason?: string;
}) {
  const media: ReactNode[] = [];
  const inline: ReactNode[] = [];

  const pieces = content.split(TOKEN);
  pieces.forEach((piece, i) => {
    if (!piece) return;

    if (/^https?:\/\//i.test(piece)) {
      if (IMG_EXT.test(piece)) {
        media.push(
          <img
            key={`m${i}`}
            src={piece}
            alt=""
            loading="lazy"
            className="max-h-[30rem] w-auto rounded-xl border border-line object-cover"
          />,
        );
      } else if (VIDEO_EXT.test(piece)) {
        media.push(
          <video
            key={`v${i}`}
            src={piece}
            controls
            preload="metadata"
            className="max-h-[30rem] w-full rounded-xl border border-line"
          />,
        );
      } else {
        inline.push(
          <a
            key={`l${i}`}
            href={piece}
            target="_blank"
            rel="noreferrer noopener"
            className="text-zap-ink hover:underline"
          >
            {piece.replace(/^https?:\/\//, '').slice(0, 60)}
          </a>,
        );
      }
      return;
    }

    if (piece.startsWith('nostr:')) {
      const ref = piece.slice(6);
      try {
        const d = nip19.decode(ref);
        if (d.type === 'npub') {
          inline.push(<MentionName key={`n${i}`} pubkey={d.data} />);
          return;
        }
        if (d.type === 'nprofile') {
          inline.push(<MentionName key={`n${i}`} pubkey={d.data.pubkey} />);
          return;
        }
        if (d.type === 'note') {
          media.push(<QuoteCard key={`q${i}`} id={d.data} />);
          return;
        }
        if (d.type === 'nevent') {
          media.push(<QuoteCard key={`q${i}`} id={d.data.id} />);
          return;
        }
      } catch {
        /* fall through */
      }
      inline.push(
        <span key={`n${i}`} className="text-ink-faint">
          {ref.slice(0, 12)}…
        </span>,
      );
      return;
    }

    if (piece.startsWith('#') && piece.length > 1) {
      inline.push(
        <span key={`h${i}`} className="text-zap-ink/80">
          {piece}
        </span>,
      );
      return;
    }

    inline.push(<Fragment key={`t${i}`}>{piece}</Fragment>);
  });

  return (
    <div className="space-y-2">
      {inline.length > 0 && (
        <p
          className={`whitespace-pre-wrap break-words leading-relaxed ${small ? 'text-sm' : ''}`}
        >
          {inline}
        </p>
      )}
      {media.length > 0 &&
        (sensitive ? (
          <SensitiveMedia reason={sensitiveReason}>{media.slice(0, 6)}</SensitiveMedia>
        ) : (
          <div className="space-y-2">{media.slice(0, 6)}</div>
        ))}
    </div>
  );
}
