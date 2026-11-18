import { useProfileValue } from '@nostr-dev-kit/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { npubOf, shortNpub } from '../nostr/ids';
import { useNow } from './useNow';

/** The Blusat mark: a speech bubble with a lightning bolt cut through it. */
export function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className="block shrink-0" aria-hidden="true">
      <path
        d="M7 3h18a5 5 0 0 1 5 5v12a5 5 0 0 1-5 5H14l-7 5v-5a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5z"
        className="fill-brand"
      />
      <path d="M18 7l-7 9h5l-2 6 7-9h-5z" fill="#fff" />
    </svg>
  );
}

/**
 * A stable two-colour gradient for people without a picture, derived from
 * their pubkey so the same person always gets the same one.
 */
export function fallbackGradient(pubkey: string): string {
  const n = (i: number) => parseInt(pubkey.slice(i, i + 4), 16) || 0;
  const h1 = n(0) % 360;
  const h2 = (h1 + 40 + (n(4) % 80)) % 360;
  return `linear-gradient(135deg, hsl(${h1} 70% 58%), hsl(${h2} 72% 42%))`;
}

/** First letter of a display name (emoji-safe), or nothing. */
function initialOf(name: string | undefined): string {
  const first = [...(name ?? '').trim()][0] ?? '';
  return /\p{L}|\p{N}/u.test(first) ? first.toUpperCase() : '';
}

export function Avatar({ pubkey, size = 40 }: { pubkey: string; size?: number }) {
  const profile = useProfileValue(pubkey);
  const url = profile?.picture;
  const [broken, setBroken] = useState<string | null>(null);
  const showImage = url && broken !== url;
  return (
    <Link to={`/p/${npubOf(pubkey)}`} className="shrink-0" aria-label="Open profile">
      {showImage ? (
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          onError={() => setBroken(url)}
          className="rounded-full bg-sunk object-cover"
          style={{ width: size, height: size }}
        />
      ) : (
        <span
          className="grid place-items-center rounded-full font-display font-bold text-white"
          style={{
            width: size,
            height: size,
            background: fallbackGradient(pubkey),
            fontSize: Math.round(size * 0.42),
          }}
          aria-hidden="true"
        >
          {initialOf(profile?.displayName || profile?.name)}
        </span>
      )}
    </Link>
  );
}

/** A friendly empty state: an icon tile, a short title, one line of help. */
export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[20px] border border-line bg-surface px-6 py-8 text-center">
      <span className="mb-1 grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-brand" aria-hidden="true">
        {icon}
      </span>
      <p className="font-display text-lg font-bold">{title}</p>
      {children && <p className="max-w-[30ch] text-sm text-ink-soft">{children}</p>}
    </div>
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
  // with no name, DisplayName already shows the short npub; don't repeat it
  if (!profile?.nip05 && !profile?.displayName && !profile?.name) return null;
  const text = profile?.nip05 ? profile.nip05.replace(/^_@/, '') : shortNpub(pubkey);
  return <span className="truncate text-ink-faint">{text}</span>;
}

export function RelativeTime({ ts }: { ts?: number }) {
  const now = useNow();
  if (!ts) return null;
  const secs = Math.max(1, now - ts);
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
    <time
      dateTime={new Date(ts * 1000).toISOString()}
      className="text-ink-faint"
      title={new Date(ts * 1000).toLocaleString()}
    >
      {label}
    </time>
  );
}
