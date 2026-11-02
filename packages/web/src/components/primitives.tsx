import { useProfileValue } from '@nostr-dev-kit/react';
import { Link } from 'react-router-dom';
import { npubOf, shortNpub } from '../nostr/ids';
import { useNow } from './useNow';

/** The Bluey mark: a speech bubble with a lightning bolt cut through it. */
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
          className="grid place-items-center rounded-full bg-brand-soft font-mono text-xs text-brand-ink"
          style={{ width: size, height: size }}
          aria-hidden="true"
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
