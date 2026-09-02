import { nip19 } from '@nostr-dev-kit/ndk';
import {
  useFollows,
  useNDKCurrentUser,
  useProfileValue,
  useSubscribe,
} from '@nostr-dev-kit/react';
import { useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { NoteCard } from '../components/NoteCard';
import { npubOf } from '../components/primitives';
import { ZapButton } from '../components/ZapButton';
import { KIND } from '../nostr/kinds';

function toPubkey(raw?: string): string | null {
  if (!raw) return null;
  if (/^[0-9a-f]{64}$/i.test(raw)) return raw;
  try {
    const d = nip19.decode(raw);
    if (d.type === 'npub') return d.data;
    if (d.type === 'nprofile') return d.data.pubkey;
  } catch {
    /* ignore */
  }
  return null;
}

export function MyProfileRedirect() {
  const me = useNDKCurrentUser();
  if (!me) return <Navigate to="/" replace />;
  return <Navigate to={`/p/${npubOf(me.pubkey)}`} replace />;
}

export function ProfilePage() {
  const { npub } = useParams();
  const pubkey = toPubkey(npub);
  const me = useNDKCurrentUser();
  const follows = useFollows();
  const profile = useProfileValue(pubkey ?? undefined);
  const [busyFollow, setBusyFollow] = useState(false);

  const following = pubkey ? follows.has(pubkey) : false;
  const isMe = me?.pubkey === pubkey;

  const { events: notes } = useSubscribe(
    pubkey ? [{ kinds: [KIND.Text], authors: [pubkey], limit: 60 }] : false,
    { closeOnEose: false },
    [pubkey],
  );
  const { events: zapsIn } = useSubscribe(
    pubkey ? [{ kinds: [KIND.ZapReceipt], '#p': [pubkey], limit: 200 }] : false,
    { closeOnEose: false },
    [pubkey],
  );

  const rootNotes = useMemo(
    () =>
      notes
        .filter((e) => !e.tags.some((t) => t[0] === 'e'))
        .slice()
        .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0)),
    [notes],
  );

  async function toggleFollow() {
    if (!me || !pubkey || busyFollow) return;
    setBusyFollow(true);
    try {
      if (following) await me.unfollow(pubkey);
      else await me.follow(pubkey);
    } catch {
      /* surfaced via UI staleness only for now */
    } finally {
      setBusyFollow(false);
    }
  }

  if (!pubkey) return <p className="p-8 text-center text-sm text-ink-soft">Unknown profile.</p>;

  return (
    <div>
      <div className="h-36 w-full bg-sunk">
        {profile?.banner && (
          <img src={profile.banner} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="px-4">
        <div className="-mt-10 flex items-end justify-between">
          {profile?.picture ? (
            <img
              src={profile.picture}
              alt=""
              className="h-20 w-20 rounded-full border-4 border-bg bg-sunk object-cover"
            />
          ) : (
            <div className="h-20 w-20 rounded-full border-4 border-bg bg-proto-soft" />
          )}
          {!isMe && me && (
            <div className="mb-1 flex items-center gap-2">
              <ZapButton pubkey={pubkey} totalSats={0} count={0} />
              <button
                type="button"
                onClick={toggleFollow}
                disabled={busyFollow}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition disabled:opacity-50 ${
                  following
                    ? 'border border-line-strong hover:border-danger hover:text-danger'
                    : 'bg-ink text-bg hover:opacity-90'
                }`}
              >
                {following ? 'Following' : 'Follow'}
              </button>
            </div>
          )}
        </div>

        <h1 className="mt-3 font-display text-xl font-bold">
          {profile?.displayName || profile?.name || 'Anonymous builder'}
        </h1>
        {profile?.nip05 && (
          <p className="text-sm text-proto">{profile.nip05.replace(/^_@/, '')}</p>
        )}
        {profile?.about && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{profile.about}</p>
        )}

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <span>
            <strong className="tabular-nums">{zapsIn.length}</strong>{' '}
            <span className="text-ink-faint">zaps received</span>
          </span>
          {(profile?.lud16 || profile?.lud06) && (
            <span className="font-mono text-xs text-zap">
              ⚡ {profile.lud16 ?? 'lnurl'}
            </span>
          )}
          <a
            href={`https://njump.me/${npubOf(pubkey)}`}
            target="_blank"
            rel="noreferrer noopener"
            className="font-mono text-xs text-ink-faint hover:text-ink-soft"
          >
            {npubOf(pubkey).slice(0, 16)}…
          </a>
        </div>
      </div>

      <div className="mt-4 border-b border-line px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
        Posts
      </div>
      {rootNotes.map((e) => (
        <NoteCard key={e.id} event={e} />
      ))}
      {rootNotes.length === 0 && (
        <p className="px-4 py-10 text-center font-mono text-xs text-ink-faint">no posts yet</p>
      )}
    </div>
  );
}
