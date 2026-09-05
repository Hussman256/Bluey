import { useNDKCurrentUser, useNDKSessionLogout } from '@nostr-dev-kit/react';
import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useClubsRelaySet } from '../nostr/clubs';
import { useServiceStatus } from '../nostr/useServiceStatus';
import { useWallet } from '../wallet/WalletProvider';
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

const nav = [
  { to: '/', label: 'Feed', end: true, icon: 'M3 12l9-9 9 9M5 10v10h14V10' },
  { to: '/clubs', label: 'Clubs', icon: 'M9 7a3 3 0 100-6 3 3 0 000 6zM17 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM2 20a7 7 0 0114 0M15 20c0-2.5 1.5-4.5 4-5' },
  { to: '/learn', label: 'Learn', icon: 'M12 3 2 8l10 5 10-5-10-5zM4 10v6l8 4 8-4v-6' },
  { to: '/ships', label: 'Ships', icon: 'M12 2 3 7v7c0 4 4 6 9 8 5-2 9-4 9-8V7l-9-5zM9 12l2 2 4-4' },
  { to: '/search', label: 'Search', icon: 'M11 4a7 7 0 105.2 11.7L21 21M11 4a7 7 0 010 14' },
  { to: '/notifications', label: 'Alerts', icon: 'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0' },
  { to: '/reads', label: 'Reads', icon: 'M4 5h16v14H4zM8 5v14' },
  { to: '/settings', label: 'Settings', icon: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z' },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
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
  useClubsRelaySet(); // connect the clubs relay on app load, not just on /clubs

  return (
    <div className="flex min-h-dvh flex-col">
      {/* chain ticker */}
      <div className="hidden h-8 shrink-0 items-center gap-6 bg-slab px-5 font-mono text-[10px] tracking-[0.02em] text-ink-faint sm:flex">
        <span className="font-medium text-zap">
          ● BLOCK {height != null ? height.toLocaleString() : '—'}
        </span>
        <Dot ok={svc.relays.connected > 0} label={`${svc.relays.connected} relays`} />
        <Dot ok={svc.index} label="index" />
        <Dot ok={svc.clubs} label="clubs" />
        {me && (
          <span className="ml-auto text-slab-ink">
            {wallet ? (balance != null ? `${balance.toLocaleString()} sats` : 'wallet connected') : (
              <NavLink to="/settings" className="hover:text-zap">
                connect a wallet →
              </NavLink>
            )}
          </span>
        )}
      </div>

      <div className="mx-auto flex w-full max-w-[1140px] flex-1">
        {/* icon rail */}
        <aside className="sticky top-8 hidden h-[calc(100dvh-2rem)] w-[76px] shrink-0 flex-col items-center justify-between border-r border-line py-5 sm:flex">
          <div className="flex flex-col items-center gap-6">
            <NavLink to="/" aria-label="Home">
              <Mark />
            </NavLink>
            <nav className="flex flex-col items-center gap-5">
              {nav.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  title={n.label}
                  aria-label={n.label}
                  className={({ isActive }) =>
                    `transition ${isActive ? 'text-ink' : 'text-ink-faint hover:text-ink-soft'}`
                  }
                >
                  <Icon d={n.icon} />
                </NavLink>
              ))}
            </nav>
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
        <main className="min-w-0 flex-1 border-r border-line pb-20 sm:pb-0">{children}</main>

        <RightRail />
      </div>

      {/* mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-bg/95 backdrop-blur sm:hidden">
        {nav.slice(0, 5).map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            aria-label={n.label}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] ${
                isActive ? 'text-zap' : 'text-ink-faint'
              }`
            }
          >
            <Icon d={n.icon} />
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
