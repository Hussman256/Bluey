import { useFollows, useNDKCurrentUser, useProfileValue, useSubscribe } from '@nostr-dev-kit/react';
import { useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { NoteCard } from '../components/NoteCard';
import { VouchedCard } from '../components/VouchedCard';
import { useProfileBadges } from '../nostr/badges';
import { EngagementScope } from '../nostr/engagement';
import { npubOf, pubkeyFrom } from '../nostr/ids';
import { KIND } from '../nostr/kinds';
import { isJunkNote, subjectId } from '../nostr/notes';
import { useShipFeed } from '../nostr/useShips';
import { ZapButton } from '../components/ZapButton';

type Tab = 'notes' | 'replies' | 'badges' | 'ships';

function BadgeGrid({ pubkey }: { pubkey: string }) {
  const badges = useProfileBadges(pubkey);
  if (badges.length === 0)
    return <p className="px-4 py-10 text-center font-mono text-xs text-ink-faint">no badges yet</p>;
  return (
    <div className="flex flex-wrap gap-6 px-5 py-6">
      {badges.map((b, i) => (
        <div key={i} className="flex w-20 flex-col items-center gap-2 text-center" title={b.description}>
          {b.image ? (
            <img src={b.image} alt="" className="h-11 w-11 rounded-full object-cover" />
          ) : (
            <span
              className="grid h-11 w-11 place-items-center rounded-full bg-zap text-lg text-white"
              aria-hidden="true"
            >
              ◆
            </span>
          )}
          <span className="font-mono text-[10px] leading-tight text-ink-faint">{b.name}</span>
        </div>
      ))}
    </div>
  );
}

export function MyProfileRedirect() {
  const me = useNDKCurrentUser();
  if (!me) return <Navigate to="/" replace />;
  return <Navigate to={`/p/${npubOf(me.pubkey)}`} replace />;
}

export function ProfilePage() {
  const { npub } = useParams();
  const pubkey = pubkeyFrom(npub);
  const me = useNDKCurrentUser();
  const follows = useFollows();
  const profile = useProfileValue(pubkey ?? undefined);
  const [busyFollow, setBusyFollow] = useState(false);
  const [followOverride, setFollowOverride] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('notes');

  const followingActual = pubkey ? follows.has(pubkey) : false;
  const following = followOverride ?? followingActual;
  const isMe = me?.pubkey === pubkey;

  const { events: notes } = useSubscribe(
    pubkey ? [{ kinds: [KIND.Text, KIND.Repost], authors: [pubkey], limit: 80 }] : false,
    { closeOnEose: false },
    [pubkey],
  );
  const { events: contactList } = useSubscribe(
    pubkey ? [{ kinds: [KIND.Contacts], authors: [pubkey], limit: 1 }] : false,
    { closeOnEose: true },
    [pubkey],
  );
  const ships = useShipFeed(pubkey ?? undefined, !!pubkey);

  const followingCount = useMemo(
    () => contactList[0]?.tags.filter((t) => t[0] === 'p').length ?? 0,
    [contactList],
  );

  const rootNotes = useMemo(
    () =>
      notes
        .filter(
          (e) => !isJunkNote(e) && (e.kind === KIND.Repost || !e.tags.some((t) => t[0] === 'e')),
        )
        .slice()
        .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
        .slice(0, 80),
    [notes],
  );
  const replyNotes = useMemo(
    () =>
      notes
        .filter((e) => !isJunkNote(e) && e.kind === KIND.Text && e.tags.some((t) => t[0] === 'e'))
        .slice()
        .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
        .slice(0, 80),
    [notes],
  );

  const shown = tab === 'replies' ? replyNotes : rootNotes;
  const engagementIds = useMemo(() => shown.map(subjectId), [shown]);

  async function toggleFollow() {
    if (!me || !pubkey || busyFollow) return;
    setBusyFollow(true);
    const next = !following;
    setFollowOverride(next);
    try {
      if (next) await me.follow(pubkey);
      else await me.unfollow(pubkey);
    } catch {
      setFollowOverride(!next);
    } finally {
      setBusyFollow(false);
    }
  }

  if (!pubkey) return <p className="p-8 text-center text-sm text-ink-soft">Unknown profile.</p>;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'notes', label: 'Notes' },
    { id: 'replies', label: 'Replies' },
    { id: 'badges', label: 'Badges' },
    ...(ships.length > 0 ? [{ id: 'ships' as const, label: 'Ships' }] : []),
  ];

  return (
    <div>
      <div className="h-32 w-full bg-sunk">
        {profile?.banner && <img src={profile.banner} alt="" className="h-full w-full object-cover" />}
      </div>
      <div className="px-5">
        <div className="-mt-10 flex items-end justify-between">
          {profile?.picture ? (
            <img
              src={profile.picture}
              alt=""
              className="h-20 w-20 rounded-full border-4 border-bg bg-sunk object-cover"
            />
          ) : (
            <div className="h-20 w-20 rounded-full border-4 border-bg bg-zap-soft" />
          )}
          {!isMe && me && (
            <div className="mb-1 flex items-center gap-2">
              <ZapButton pubkey={pubkey} totalSats={0} count={0} />
              <button
                type="button"
                onClick={toggleFollow}
                disabled={busyFollow}
                className={`rounded-full px-5 py-1.5 text-sm font-bold transition disabled:opacity-50 ${
                  following
                    ? 'border border-line-strong hover:border-danger hover:text-danger'
                    : 'bg-zap text-white hover:opacity-90'
                }`}
              >
                {following ? 'Following' : 'Follow'}
              </button>
            </div>
          )}
        </div>

        <h1 className="mt-3 font-display text-[22px] font-extrabold">
          {profile?.displayName || profile?.name || 'Anonymous'}
        </h1>
        <p className="mt-0.5 font-mono text-[11px] text-ink-faint">
          {profile?.nip05 ? `${profile.nip05.replace(/^_@/, '')} · ` : ''}
          {npubOf(pubkey).slice(0, 15)}…
        </p>
        {profile?.about && (
          <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed">{profile.about}</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-ink-soft">
          <span>
            <strong className="font-display tabular-nums text-ink">
              {followingCount.toLocaleString()}
            </strong>{' '}
            Following
          </span>
          {(profile?.lud16 || profile?.lud06) && (
            <span className="font-mono text-xs text-zap-ink">⚡ {profile.lud16 ?? 'lnurl'}</span>
          )}
        </div>

        <VouchedCard pubkey={pubkey} />
      </div>

      <div className="mt-5 flex gap-7 border-b border-line px-5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 pb-3 text-[13px] font-semibold transition ${
              tab === t.id ? 'border-zap text-ink' : 'border-transparent text-ink-faint hover:text-ink-soft'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'badges' ? (
        <BadgeGrid pubkey={pubkey} />
      ) : tab === 'ships' ? (
        <EngagementScope ids={ships.map((e) => e.id)}>
          {ships.map((e) => (
            <NoteCard key={e.id} event={e} />
          ))}
        </EngagementScope>
      ) : (
        <EngagementScope ids={engagementIds}>
          {shown.map((e) => (
            <NoteCard key={e.id} event={e} />
          ))}
          {shown.length === 0 && (
            <p className="px-4 py-10 text-center font-mono text-xs text-ink-faint">
              {tab === 'replies' ? 'no replies yet' : 'no posts yet'}
            </p>
          )}
        </EngagementScope>
      )}
    </div>
  );
}
