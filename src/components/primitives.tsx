import { nip19 } from '@nostr-dev-kit/ndk';
import { useProfileValue } from '@nostr-dev-kit/react';
import { Link } from 'react-router-dom';

export function npubOf(pubkey: string) {
  try {
    return nip19.npubEncode(pubkey);
  } catch {
    return pubkey;
  }
}

export function shortNpub(pubkey: string) {
  const n = npubOf(pubkey);
  return `${n.slice(0, 10)}…${n.slice(-4)}`;
}

export function Avatar({ pubkey, size = 40 }: { pubkey: string; size?: number }) {
  const profile = useProfileValue(pubkey);
  const url = profile?.picture;
  return (
    <Link to={`/p/${npubOf(pubkey)}`} className="shrink-0" aria-label="Open profile">
      {url ? (
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          className="rounded-full bg-sunk object-cover"
          style={{ width: size, height: size }}
        />
      ) : (
        <span
          className="grid place-items-center rounded-full bg-proto-soft font-mono text-xs text-proto"
          style={{ width: size, height: size }}
        >
          {(profile?.name ?? '?').slice(0, 2)}
        </span>
      )}
    </Link>
  );
}

export function DisplayName({ pubkey, className = '' }: { pubkey: string; className?: string }) {
  const profile = useProfileValue(pubkey);
  const name = profile?.displayName || profile?.name || shortNpub(pubkey);
  return (
    <Link to={`/p/${npubOf(pubkey)}`} className={`font-semibold hover:underline ${className}`}>
      {name}
    </Link>
  );
}

export function Handle({ pubkey }: { pubkey: string }) {
  const profile = useProfileValue(pubkey);
  if (profile?.nip05) return <span className="text-ink-faint">{profile.nip05.replace(/^_@/, '')}</span>;
  return <span className="text-ink-faint">{shortNpub(pubkey)}</span>;
}

export function RelativeTime({ ts }: { ts?: number }) {
  if (!ts) return null;
  const secs = Math.max(1, Math.floor(Date.now() / 1000 - ts));
  const label =
    secs < 60
      ? `${secs}s`
      : secs < 3600
        ? `${Math.floor(secs / 60)}m`
        : secs < 86400
          ? `${Math.floor(secs / 3600)}h`
          : secs < 604800
            ? `${Math.floor(secs / 86400)}d`
            : new Date(ts * 1000).toLocaleDateString();
  return (
    <time dateTime={new Date(ts * 1000).toISOString()} className="text-ink-faint" title={new Date(ts * 1000).toLocaleString()}>
      {label}
    </time>
  );
}

const IMG_RE = /https?:\/\/\S+\.(?:png|jpe?g|gif|webp|avif)(?:\?\S*)?/gi;
const URL_RE = /https?:\/\/[^\s<]+/g;

/** Minimal, safe-ish content renderer: links, images, nostr: mentions stripped to short refs. */
export function NoteContent({ content }: { content: string }) {
  const images = content.match(IMG_RE) ?? [];
  const text = content
    .replace(IMG_RE, '')
    .replace(/nostr:(npub1|nprofile1|note1|nevent1|naddr1)\w+/g, (m) => {
      const id = m.slice(6);
      return id.slice(0, 12) + '…';
    })
    .trim();

  const parts = text.split(URL_RE);
  const urls = text.match(URL_RE) ?? [];

  return (
    <div className="space-y-2">
      <p className="whitespace-pre-wrap break-words leading-relaxed">
        {parts.flatMap((p, i) => [
          <span key={`t${i}`}>{p}</span>,
          urls[i] ? (
            <a
              key={`u${i}`}
              href={urls[i]}
              target="_blank"
              rel="noreferrer noopener"
              className="text-proto hover:underline"
            >
              {urls[i].replace(/^https?:\/\//, '').slice(0, 48)}
            </a>
          ) : null,
        ])}
      </p>
      {images.slice(0, 4).map((src) => (
        <img
          key={src}
          src={src}
          alt=""
          loading="lazy"
          className="max-h-[28rem] rounded-xl border border-line object-cover"
        />
      ))}
    </div>
  );
}
