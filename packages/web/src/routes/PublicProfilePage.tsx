import type { NDKEvent } from '@nostr-dev-kit/ndk';
import { useNDK, useNDKCurrentUser, useProfileValue } from '@nostr-dev-kit/react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BootcampRow, VerifiedMark } from '../components/learn';
import { Mark } from '../components/primitives';
import { useProfileBadges } from '../nostr/badges';
import { resolveHandle } from '../nostr/handles';
import { npubOf } from '../nostr/ids';
import { CATEGORY_LABEL, parseShip } from '../nostr/ships';
import { useApprovedTutors } from '../nostr/tutors';
import { useBootcampList } from '../nostr/useBootcamps';
import { useShipFeed, useShipVerifications } from '../nostr/useShips';

function Fact({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl border border-line bg-surface p-3">
      <span className="font-display text-[26px] font-extrabold leading-none">{n}</span>
      <span className="text-xs leading-snug text-ink-soft">{label}</span>
    </div>
  );
}

function ShipTile({ event, vouches }: { event: NDKEvent; vouches: number }) {
  const s = useMemo(() => parseShip(event), [event]);
  const title = s.title || s.description.split('\n')[0].slice(0, 80) || 'Untitled Ship';
  return (
    <article className="flex flex-col overflow-hidden rounded-[20px] border border-line bg-surface">
      {s.cover ? (
        <img src={s.cover} alt="" loading="lazy" className="aspect-[16/9] w-full bg-sunk object-cover" />
      ) : (
        <div className="grid aspect-[16/9] w-full place-items-center bg-brand-soft font-display text-2xl font-extrabold text-brand" aria-hidden="true">
          {title.slice(0, 2).toUpperCase()}
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        {s.category && (
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-faint">
            {CATEGORY_LABEL[s.category]}
          </span>
        )}
        <h3 className="font-display text-[17px] font-bold leading-snug">{title}</h3>
        {s.description && s.title && <p className="line-clamp-3 text-sm leading-relaxed text-ink-soft">{s.description}</p>}
        {s.tools.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Built with">
            {s.tools.map((t) => (
              <li key={t} className="rounded-md bg-sunk px-1.5 py-0.5 font-mono text-[11px] text-ink-soft">
                {t}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs">
          <span className={vouches ? 'font-semibold text-good' : 'text-ink-faint'}>
            {vouches ? `Vouched by ${vouches}` : 'No vouches yet'}
          </span>
          {s.links.slice(0, 2).map((l) => (
            <a key={l} href={l} target="_blank" rel="noreferrer noopener" className="font-semibold text-brand hover:underline">
              {l.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]} ↗
            </a>
          ))}
        </div>
      </div>
    </article>
  );
}

/**
 * The public proof-of-work page at /@name. Open to anyone, signed in or not:
 * everything on it is read from Nostr and checkable in any client.
 */
export function PublicProfilePage({ handle }: { handle: string }) {
  const { ndk } = useNDK();
  const me = useNDKCurrentUser();
  const [pubkey, setPubkey] = useState<string | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!ndk) return;
    let live = true;
    resolveHandle(ndk, handle).then((pk) => live && setPubkey(pk));
    return () => {
      live = false;
    };
  }, [ndk, handle]);

  const profile = useProfileValue(pubkey ?? undefined);
  const ships = useShipFeed(pubkey ?? undefined, !!pubkey);
  const shipIds = useMemo(() => ships.map((e) => e.id), [ships]);
  const verifs = useShipVerifications(shipIds);
  const badges = useProfileBadges(pubkey ?? undefined);
  const tutors = useApprovedTutors();
  const { bootcamps } = useBootcampList();

  const teaching = useMemo(() => bootcamps.filter((b) => b.pubkey === pubkey), [bootcamps, pubkey]);
  const vouchesReceived = shipIds.reduce((n, id) => n + (verifs.get(id)?.size ?? 0), 0);
  const vouchedShips = shipIds.filter((id) => (verifs.get(id)?.size ?? 0) > 0).length;
  const finished = new Set(badges.map((b) => b.name).filter((n) => / — Completed$/.test(n))).size;

  useEffect(() => {
    const name = profile?.displayName || profile?.name;
    document.title = name ? `${name} · Bluey` : 'Bluey';
    return () => {
      document.title = 'Bluey';
    };
  }, [profile]);

  const name = profile?.displayName || profile?.name || 'Builder';
  const address = profile?.nip05?.replace(/^_@/, '');

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: `${name} on Bluey`, url }).catch(() => undefined);
    } else {
      await navigator.clipboard?.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link to="/" aria-label="Bluey home" className="flex items-center gap-2">
            <Mark size={28} />
            <span className="font-display text-lg font-extrabold">bluey</span>
          </Link>
          <span className="flex-1" />
          {me ? (
            pubkey && (
              <Link to={`/p/${npubOf(pubkey)}`} className="min-h-10 rounded-xl border border-line-strong px-3.5 py-2 text-sm font-semibold">
                Open in Bluey
              </Link>
            )
          ) : (
            <Link to="/" className="min-h-10 rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-white">
              Join Bluey
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 pb-16 pt-8">
        {pubkey === undefined && <p className="py-16 text-center font-mono text-xs text-ink-faint">finding @{handle}…</p>}
        {pubkey === null && (
          <div className="py-16 text-center">
            <h1 className="font-display text-2xl font-extrabold">No one here yet</h1>
            <p className="mt-2 text-sm text-ink-soft">
              @{handle} isn't a Bluey name. Check the spelling, or claim it yourself.
            </p>
          </div>
        )}

        {pubkey && (
          <>
            <section className="flex flex-col gap-4">
              <div className="flex items-end gap-4">
                {profile?.picture ? (
                  <img src={profile.picture} alt="" className="h-24 w-24 rounded-[30px] bg-sunk object-cover" />
                ) : (
                  <div className="grid h-24 w-24 place-items-center rounded-[30px] bg-brand font-display text-3xl font-extrabold text-white" aria-hidden="true">
                    {name.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <h1 className="flex items-center gap-2 font-display text-[32px] font-extrabold leading-tight">
                  {name}
                  {tutors.isApproved(pubkey) && <VerifiedMark size={24} />}
                </h1>
                <p className="font-mono text-xs text-ink-faint">{address ?? `${npubOf(pubkey).slice(0, 16)}…`}</p>
              </div>
              {profile?.about && <p className="max-w-xl whitespace-pre-wrap text-[15px] leading-relaxed">{profile.about}</p>}
              <div className="flex flex-wrap gap-2">
                {profile?.lud16 && (
                  <a
                    href={`lightning:${profile.lud16}`}
                    className="flex min-h-11 items-center gap-1.5 rounded-xl bg-zap px-4 text-sm font-semibold text-white"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                      <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
                    </svg>
                    Send sats
                  </a>
                )}
                <button type="button" onClick={share} className="min-h-11 rounded-xl border border-line-strong bg-surface px-4 text-sm font-semibold">
                  {copied ? 'Link copied' : 'Share this page'}
                </button>
              </div>
            </section>

            <section aria-label="Proof" className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Fact n={ships.length} label={`Ship${ships.length === 1 ? '' : 's'} published`} />
              <Fact n={vouchedShips} label="vouched by others" />
              <Fact n={vouchesReceived} label={`vouch${vouchesReceived === 1 ? '' : 'es'} received`} />
              <Fact n={finished} label={`bootcamp${finished === 1 ? '' : 's'} finished`} />
            </section>

            <section aria-label="Ships" className="flex flex-col gap-3">
              <h2 className="font-display text-xl font-bold">What they've shipped</h2>
              {ships.length === 0 ? (
                <p className="rounded-2xl border border-line bg-surface px-4 py-6 text-center text-sm text-ink-soft">Nothing shipped yet.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {ships.map((e) => (
                    <ShipTile key={e.id} event={e} vouches={verifs.get(e.id)?.size ?? 0} />
                  ))}
                </div>
              )}
            </section>

            {teaching.length > 0 && (
              <section aria-label="Teaching" className="flex flex-col gap-3">
                <h2 className="font-display text-xl font-bold">Teaches</h2>
                {teaching.map((b) => (
                  <BootcampRow key={b.id} bootcamp={b} verified={tutors.isApproved(pubkey)} />
                ))}
              </section>
            )}

            {badges.length > 0 && (
              <section aria-label="Badges" className="flex flex-col gap-3">
                <h2 className="font-display text-xl font-bold">Badges</h2>
                <ul className="flex flex-wrap gap-2">
                  {badges.map((b, i) => (
                    <li key={i} title={b.description} className="flex items-center gap-2 rounded-full border border-line bg-surface py-1.5 pl-1.5 pr-3.5 text-sm">
                      {b.image ? (
                        <img src={b.image} alt="" className="h-7 w-7 rounded-full object-cover" />
                      ) : (
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-soft text-brand" aria-hidden="true">
                          <VerifiedMark size={16} />
                        </span>
                      )}
                      {b.name}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <footer className="rounded-[20px] bg-slab p-5 text-sm leading-relaxed text-slab-ink">
              <strong className="text-white">You can check all of this.</strong> Every Ship, vouch and badge here is a
              signed Nostr event. Nothing is stored only by Bluey, so it can't be edited behind the scenes, and it goes
              wherever {name} goes. Look them up in any Nostr app with{' '}
              <a href={`https://njump.me/${npubOf(pubkey)}`} target="_blank" rel="noreferrer noopener" className="break-all font-mono text-xs text-brand-bright underline">
                {npubOf(pubkey)}
              </a>
              .
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
