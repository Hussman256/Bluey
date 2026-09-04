import { useNDKCurrentUser, useNDKSessionLogout } from '@nostr-dev-kit/react';
import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { APP_NAME } from '../nostr/config';
import { useWallet } from '../wallet/WalletProvider';
import { npubOf } from '../nostr/ids';
import { Avatar } from './primitives';

const nav = [
  { to: '/', label: 'Feed', end: true, icon: 'M3 12l9-9 9 9M5 10v10h14V10' },
  { to: '/clubs', label: 'Clubs', icon: 'M9 7a3 3 0 100-6 3 3 0 000 6zM17 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM2 20a7 7 0 0114 0M15 20c0-2.5 1.5-4.5 4-5' },
  { to: '/learn', label: 'Learn', icon: 'M12 3 2 8l10 5 10-5-10-5zM4 10v6l8 4 8-4v-6' },
  { to: '/search', label: 'Search', icon: 'M11 4a7 7 0 105.2 11.7L21 21M11 4a7 7 0 010 14' },
  { to: '/notifications', label: 'Alerts', icon: 'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0' },
  { to: '/reads', label: 'Reads', icon: 'M4 5h16v14H4zM8 5v14' },
  { to: '/me', label: 'Profile', icon: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 20a8 8 0 0116 0' },
  { to: '/settings', label: 'Settings', icon: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z' },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const me = useNDKCurrentUser();
  const logout = useNDKSessionLogout();
  const navigate = useNavigate();
  const { balance, wallet } = useWallet();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl">
      {/* sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col justify-between border-r border-line px-3 py-5 sm:flex">
        <div>
          <div className="px-3 font-display text-2xl font-bold tracking-tight">
            {APP_NAME}
            <span className="text-zap">.</span>
          </div>
          <nav className="mt-6 flex flex-col gap-1">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    isActive ? 'bg-surface text-ink' : 'text-ink-soft hover:bg-surface/60 hover:text-ink'
                  }`
                }
              >
                <Icon d={n.icon} />
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>

        {me && (
          <div className="flex flex-col gap-2 px-1">
            <div className="rounded-xl border border-line px-3 py-2 text-xs">
              <div className="text-ink-faint">Wallet</div>
              <div className="mt-0.5 font-mono">
                {wallet ? (
                  balance != null ? (
                    <span className="text-zap">{balance.toLocaleString()} sats</span>
                  ) : (
                    <span className="text-good">connected</span>
                  )
                ) : (
                  <NavLink to="/settings" className="text-proto hover:underline">
                    connect →
                  </NavLink>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate(`/p/${npubOf(me.pubkey)}`)}
              className="flex items-center gap-2 rounded-xl px-2 py-2 text-left text-sm hover:bg-surface/60"
            >
              <Avatar pubkey={me.pubkey} size={28} />
              <span className="truncate text-ink-soft">you</span>
            </button>
            <button
              type="button"
              onClick={() => {
                logout();
                navigate('/');
              }}
              className="px-2 text-left text-xs text-ink-faint hover:text-danger"
            >
              Sign out
            </button>
          </div>
        )}
      </aside>

      {/* main */}
      <main className="min-w-0 flex-1 border-x border-line pb-20 sm:pb-0">{children}</main>

      {/* mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-bg/95 backdrop-blur sm:hidden">
        {nav.slice(0, 5).map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
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
