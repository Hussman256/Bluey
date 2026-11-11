import { useFollows, useNDKCurrentUser, useProfileValue, useSubscribe } from '@nostr-dev-kit/react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Avatar, DisplayName, Handle } from '../components/primitives';
import { pubkeyFrom } from '../nostr/ids';
import { KIND } from '../nostr/kinds';
import { useIndexFollowers } from '../nostr/useIndex';

const STEP = 50;

function FollowToggle({ pubkey }: { pubkey: string }) {
  const me = useNDKCurrentUser();
  const follows = useFollows();
  const [override, setOverride] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const following = override ?? follows.has(pubkey);

  if (!me || me.pubkey === pubkey) return null;

  async function toggle() {
    if (!me || busy) return;
    setBusy(true);
    const next = !following;
    setOverride(next);
    try {
      if (next) await me.follow(pubkey);
      else await me.unfollow(pubkey);
    } catch {
      setOverride(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      className={`min-h-9 shrink-0 rounded-full px-4 text-sm font-bold transition disabled:opacity-50 ${
        following ? 'border border-line-strong hover:border-danger hover:text-danger' : 'bg-brand text-white hover:opacity-90'
      }`}
    >
      {following ? 'Following' : 'Follow'}
    </button>
  );
}

function PersonRow({ pubkey }: { pubkey: string }) {
  const profile = useProfileValue(pubkey);
  return (
    <li className="flex items-center gap-3 border-b border-line px-4 py-3">
      <Avatar pubkey={pubkey} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-col text-sm">
          <DisplayName pubkey={pubkey} className="truncate" />
          <Handle pubkey={pubkey} />
        </div>
        {profile?.about && <p className="mt-0.5 line-clamp-1 text-xs text-ink-soft">{profile.about}</p>}
      </div>
      <FollowToggle pubkey={pubkey} />
    </li>
  );
}

/** Who someone follows (their own public list, from relays) or who follows them (from the index). */
export function FollowListPage({ list }: { list: 'following' | 'followers' }) {
  const { npub } = useParams();
  const pubkey = pubkeyFrom(npub);
  const owner = useProfileValue(pubkey ?? undefined);
  const [shown, setShown] = useState(STEP);

  const { events: contacts, eose } = useSubscribe(
    pubkey && list === 'following' ? [{ kinds: [KIND.Contacts], authors: [pubkey], limit: 1 }] : false,
    { closeOnEose: true },
    [pubkey, list],
  );
  const following = useMemo(() => {
    const newest = contacts.reduce<(typeof contacts)[number] | null>(
      (a, e) => (!a || (e.created_at ?? 0) > (a.created_at ?? 0) ? e : a),
      null,
    );
    return [...new Set(newest?.tags.filter((t) => t[0] === 'p' && t[1]).map((t) => t[1]) ?? [])];
  }, [contacts]);

  const followers = useIndexFollowers(list === 'followers' ? pubkey : null, 500);

  if (!pubkey) return <p className="p-8 text-center text-sm text-ink-soft">Unknown profile.</p>;

  const people = list === 'following' ? following : (followers.data?.pubkeys ?? []);
  const name = owner?.displayName || owner?.name || 'This person';
  const loading = list === 'following' ? !eose : followers.loading;
  const total = list === 'followers' && followers.data ? followers.data.total : people.length;

  return (
    <div>
      <header className="sticky top-0 z-10 border-b border-line bg-bg/90 px-4 pb-0 pt-3.5 backdrop-blur">
        <h1 className="truncate font-display text-xl font-extrabold">{name}</h1>
        <nav className="mt-2 flex gap-5 text-sm font-semibold" aria-label="Connections">
          {(['following', 'followers'] as const).map((l) => (
            <Link
              key={l}
              to={`/p/${npub}/${l}`}
              replace
              onClick={() => setShown(STEP)}
              className={`border-b-2 pb-2 capitalize ${l === list ? 'border-brand text-ink' : 'border-transparent text-ink-faint'}`}
            >
              {l}
            </Link>
          ))}
        </nav>
      </header>

      {list === 'followers' && !followers.loading && !followers.fromIndex ? (
        <p className="px-6 py-12 text-center text-sm text-ink-soft">
          Followers come from Bluey's index, which isn't reachable right now. Try again in a moment.
        </p>
      ) : (
        <>
          {list === 'followers' && followers.fromIndex && total > 0 && (
            <p className="px-4 py-2 font-mono text-[11px] text-ink-faint">
              {total.toLocaleString()} found on the relays Bluey reads. The real number may be higher.
            </p>
          )}
          <ul>
            {people.slice(0, shown).map((pk) => (
              <PersonRow key={pk} pubkey={pk} />
            ))}
          </ul>
          {people.length === 0 && (
            <p className="px-6 py-12 text-center font-mono text-xs text-ink-faint">
              {loading ? 'loading…' : list === 'following' ? 'Not following anyone yet.' : 'No followers found yet.'}
            </p>
          )}
          {people.length > shown && (
            <div className="px-4 py-5 text-center">
              <button
                type="button"
                onClick={() => setShown((n) => n + STEP)}
                className="min-h-11 rounded-xl border border-line-strong bg-surface px-4 text-sm font-semibold"
              >
                Show more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
