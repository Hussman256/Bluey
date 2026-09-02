import { useNDK, useNDKCurrentUser } from '@nostr-dev-kit/react';
import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { APP_NAME } from './nostr/config';
import { FeedPage } from './routes/FeedPage';
import { MyProfileRedirect, ProfilePage } from './routes/ProfilePage';
import { ReadsPage } from './routes/ReadsPage';
import { SettingsPage } from './routes/SettingsPage';
import { ThreadPage } from './routes/ThreadPage';
import { LoginScreen } from './session/LoginScreen';

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

export function App() {
  const { ndk } = useNDK();
  const me = useNDKCurrentUser();
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    if (me) {
      setBooted(true);
      return;
    }
    const t = setTimeout(() => setBooted(true), 600);
    return () => clearTimeout(t);
  }, [me]);

  if (!ndk || !booted) return <Splash />;
  if (!me) return <LoginScreen />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<FeedPage />} />
        <Route path="/reads" element={<ReadsPage />} />
        <Route path="/e/:id" element={<ThreadPage />} />
        <Route path="/p/:npub" element={<ProfilePage />} />
        <Route path="/me" element={<MyProfileRedirect />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
