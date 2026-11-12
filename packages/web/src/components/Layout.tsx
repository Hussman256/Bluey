import { useNDKCurrentUser, useNDKSessionLogout } from '@nostr-dev-kit/react';
import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useClubsRelaySet } from '../nostr/clubs';
import { useServiceStatus } from '../nostr/useServiceStatus';
import { useWallet } from '../wallet/WalletProvider';
import { MakeSheet } from './MakeSheet';
import { Avatar, Mark } from './primitives';
import { RightRail } from './RightRail';
import { useBlockHeight } from './useBlockHeight';

function Dot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1.5" title={label}>
      <span
        className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-good' : 'bg-slab-line'}`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

const ICON = {
  feed: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  learn: 'M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2zM22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z',
  clubs: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 6',
  you: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  ships: 'M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2M9 15l-3-3c1-4 4-8 9-9 2 0 3 1 3 3-1 5-5 8-9 9z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  alerts: 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  messages: 'M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z',
  reads: 'M6 3h9l5 5v13H6zM14 3v6h6M9 13h8M9 17h6',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM9 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  plus: 'M12 5v14M5 12h14',
};

/** Tabs on the phone dock. Alerts and search live in the Feed header there. */
const dock = [
  { to: '/', label: 'Feed', end: true, icon: ICON.feed },
  { to: '/learn', label: 'Learn', icon: ICON.learn },
  { to: '/clubs', label: 'Clubs', icon: ICON.clubs },
  { to: '/me', label: 'You', icon: ICON.you },
];

const rail = [
  { to: '/', label: 'Feed', end: true, icon: ICON.feed },
  { to: '/learn', label: 'Learn', icon: ICON.learn },
  { to: '/clubs', label: 'Clubs', icon: ICON.clubs },
  { to: '/ships', label: 'Ships', icon: ICON.ships },
  { to: '/search', label: 'Search', icon: ICON.search },
  { to: '/notifications', label: 'Alerts', icon: ICON.alerts },
  { to: '/messages', label: 'Messages', icon: ICON.messages },
  { to: '/reads', label: 'Reads', icon: ICON.reads },
  { to: '/settings', label: 'Settings', icon: ICON.settings },
];

function Icon({ d, size = 22, strong = false }: { d: string; size?: number; strong?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      style={{ width: size, height: size }}
      fill="none"
      stroke="currentColor"
      strokeWidth={strong ? 2.4 : 1.8}
      aria-hidden="true"
    >
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const me = useNDKCurrentUser();
  const logout = useNDKSessionLogout();
  const navigate = useNavigate();
  const { balance, wallet } = useWallet();
  const svc = useServiceStatus();
  const height = useBlockHeight();
  const [making, setMaking] = useState(false);
  useClubsRelaySet(); // connect the clubs relay on app load, not just on /clubs

  return (
    <div className="flex min-h-dvh flex-col">
      {/* chain ticker */}
      <div className="hidden h-8 shrink-0 items-center gap-6 bg-slab px-5 font-mono text-[10px] tracking-[0.02em] text-slab-ink sm:flex">
        <span className="font-medium text-white">
          BLOCK {height != null ? height.toLocaleString() : '—'}
        </span>
        <Dot ok={svc.relays.connected > 0} label={`${svc.relays.connected} relays`} />
        <Dot ok={svc.index} label="index" />
        <Dot ok={svc.clubs} label="clubs" />
        {me && (
          <span className="ml-auto">
            {wallet ? (
              <span className="text-zap">
                {balance != null ? `${balance.toLocaleString()} sats` : 'wallet connected'}
              </span>
            ) : (
              <NavLink to="/settings" className="hover:text-white">
                connect a wallet →
              </NavLink>
            )}
          </span>
        )}
      </div>

      <div className="mx-auto flex w-full max-w-[1140px] flex-1">
        {/* desktop rail */}
        <aside className="sticky top-8 hidden h-[calc(100dvh-2rem)] w-[76px] shrink-0 flex-col items-center justify-between border-r border-line py-5 sm:flex">
          <div className="flex flex-col items-center gap-6">
            <NavLink to="/" aria-label="Home">
              <Mark size={32} />
            </NavLink>
            <nav className="flex flex-col items-center gap-2">
              {rail.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  title={n.label}
                  aria-label={n.label}
                  className={({ isActive }) =>
                    `grid h-11 w-11 place-items-center rounded-2xl transition ${
                      isActive ? 'bg-brand-soft text-brand' : 'text-ink-faint hover:bg-surface hover:text-ink'
                    }`
                  }
                >
                  <Icon d={n.icon} />
                </NavLink>
              ))}
            </nav>
            {me && (
              <button
                type="button"
                onClick={() => setMaking(true)}
                aria-label="Make something"
                title="Make something"
                className="grid h-12 w-12 place-items-center rounded-2xl bg-brand text-white hover:opacity-90"
              >
                <Icon d={ICON.plus} size={24} strong />
              </button>
            )}
          </div>

          {me && (
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/me')}
                title="Your profile"
                aria-label="Your profile"
                className="rounded-full"
              >
                <Avatar pubkey={me.pubkey} size={34} />
              </button>
              <button
                type="button"
                onClick={() => {
                  logout();
                  navigate('/');
                }}
                title="Sign out"
                aria-label="Sign out"
                className="text-ink-faint transition hover:text-danger"
              >
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          )}
        </aside>

        {/* main */}
        <main className="min-w-0 flex-1 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:border-r sm:border-line sm:pb-0">
          {children}
        </main>

        <RightRail />
      </div>

      {/* phone dock */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-1 border-t border-line bg-surface px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 sm:hidden"
      >
        {dock.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              `flex min-h-[52px] flex-1 flex-col items-center justify-center gap-[3px] text-[11px] ${
                isActive ? 'font-semibold text-brand' : 'font-medium text-ink-faint'
              }`
            }
          >
            <Icon d={n.icon} size={24} />
            {n.label}
          </NavLink>
        ))}
        {me && (
          <button
            type="button"
            onClick={() => setMaking(true)}
            aria-label="Make something"
            className="ml-1 grid h-[52px] w-14 shrink-0 place-items-center rounded-2xl bg-brand text-white"
          >
            <Icon d={ICON.plus} size={26} strong />
          </button>
        )}
      </nav>

      {making && <MakeSheet onClose={() => setMaking(false)} />}
    </div>
  );
}
