import { useNDK } from '@nostr-dev-kit/react';
import { useEffect, useState } from 'react';
import { CLUBS_RELAY } from './clubs';
import { useIndexStatus } from './useIndex';

export interface ServiceStatus {
  relays: { connected: number; total: number };
  clubs: boolean;
  index: boolean;
}

export function useServiceStatus(): ServiceStatus {
  const { ndk } = useNDK();
  const index = useIndexStatus();
  const [relays, setRelays] = useState({ connected: 0, total: 0 });
  const [clubs, setClubs] = useState(false);

  useEffect(() => {
    if (!ndk) return;
    const tick = () => {
      const s = ndk.pool.stats();
      setRelays({ connected: s.connected, total: s.total });
      const club = ndk.pool
        .connectedRelays()
        .some((r) => r.url.replace(/\/$/, '') === CLUBS_RELAY.replace(/\/$/, ''));
      setClubs(club);
    };
    tick();
    const t = setInterval(tick, 4000);
    return () => clearInterval(t);
  }, [ndk]);

  return { relays, clubs, index };
}
