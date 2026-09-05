import { useEffect, useState } from 'react';

/**
 * The current Bitcoin block height, for the ticker strip. Polls mempool.space's
 * public REST API every 60s. Returns null until the first successful fetch (and
 * stays on the last known value if a later poll fails) — the ticker just hides
 * the number when it's null.
 */
const ENDPOINT = 'https://mempool.space/api/blocks/tip/height';

let cached: number | null = null;

export function useBlockHeight(): number | null {
  const [height, setHeight] = useState<number | null>(cached);

  useEffect(() => {
    let alive = true;

    const pull = async () => {
      try {
        const res = await fetch(ENDPOINT, { headers: { accept: 'text/plain' } });
        if (!res.ok) return;
        const n = Number.parseInt((await res.text()).trim(), 10);
        if (alive && Number.isFinite(n)) {
          cached = n;
          setHeight(n);
        }
      } catch {
        /* offline or blocked — keep the last known value */
      }
    };

    void pull();
    const t = setInterval(() => void pull(), 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return height;
}
