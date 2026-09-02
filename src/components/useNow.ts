import { useEffect, useState } from 'react';

/** Current unix seconds, refreshed on an interval so relative timestamps stay live. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
