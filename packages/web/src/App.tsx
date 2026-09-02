import { useNDK, useNDKCurrentUser } from '@nostr-dev-kit/react';
import { Suspense, lazy, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { APP_NAME } from './nostr/config';
import { LoginScreen } from './session/LoginScreen';

const FeedPage = lazy(() => import('./routes/FeedPage').then((m) => ({ default: m.FeedPage })));
const ReadsPage = lazy(() => import('./routes/ReadsPage').then((m) => ({ default: m.ReadsPage })));
const ThreadPage = lazy(() => import('./routes/ThreadPage').then((m) => ({ default: m.ThreadPage })));
const NotificationsPage = lazy(() =>
  import('./routes/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
);
const SearchPage = lazy(() =>
  import('./routes/SearchPage').then((m) => ({ default: m.SearchPage })),
);
const ProfilePage = lazy(() =>
  import('./routes/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);
const MyProfileRedirect = lazy(() =>
  import('./routes/ProfilePage').then((m) => ({ default: m.MyProfileRedirect })),
);
const SettingsPage = lazy(() =>
  import('./routes/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="font-display text-2xl font-bold tracking-tight text-ink-soft">
        {APP_NAME}
        <span className="text-zap">.</span>
      </div>
    </div>
  );
}

/** A stored session key means NDK is hydrating a login — wait for it rather than flashing the login screen. */
const sessionPending = () => {
  try {
    return !!localStorage.getItem('ndk-active-pubkey');
  } catch {
    return false;
  }
};

export function App() {
  const { ndk } = useNDK();
  const me = useNDKCurrentUser();
  const location = useLocation();
  const [hydrationTimedOut, setHydrationTimedOut] = useState(false);
  const [expectSession] = useState(sessionPending);

  // bound how long we wait for a stored session to hydrate before showing login
  useEffect(() => {
    if (!expectSession) return;
    const t = setTimeout(() => setHydrationTimedOut(true), 2500);
    return () => clearTimeout(t);
  }, [expectSession]);

  const hydrating = expectSession && !me && !hydrationTimedOut;

  if (!ndk || hydrating) return <Splash />;
  if (!me) return <LoginScreen />;

  return (
    <Layout>
      <ErrorBoundary key={location.pathname}>
        <Suspense
          fallback={
            <p className="px-4 py-10 text-center font-mono text-xs text-ink-faint">loading…</p>
          }
        >
          <Routes>
            <Route path="/" element={<FeedPage />} />
            <Route path="/reads" element={<ReadsPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/e/:id" element={<ThreadPage />} />
            <Route path="/p/:npub" element={<ProfilePage />} />
            <Route path="/me" element={<MyProfileRedirect />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </Layout>
  );
}
