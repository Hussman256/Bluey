import { useEffect, useState } from 'react';

/**
 * The current Bitcoin block height, for the ticker strip. Races a couple of
 * public REST APIs (whichever answers first wins), times out at 6s, and
 * re-polls every 90s. Returns null until the first success and keeps the last
 * known value if a later poll fails — the ticker shows "—" while it's null.
 */
const ENDPOINTS = [
  'https://blockstream.info/api/blocks/tip/height',
  'https://mempool.space/api/blocks/tip/height',
];

let cached: number | null = null;

async function fetchOne(url: string, signal: AbortSignal): Promise<number> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(String(res.status));
  const n = Number.parseInt((await res.text()).trim(), 10);
  if (!Number.isFinite(n) || n <= 0) throw new Error('bad body');
  return n;
}

export function useBlockHeight(): number | null {
  const [height, setHeight] = useState<number | null>(cached);

  useEffect(() => {
    let alive = true;

    const pull = () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6_000);
      Promise.any(ENDPOINTS.map((u) => fetchOne(u, ctrl.signal)))
        .then((n) => {
          if (alive) {
            cached = n;
            setHeight(n);
          }
        })
        .catch(() => {
          /* every source failed — keep the last known value */
        })
        .finally(() => clearTimeout(timer));
    };

    pull();
    const t = setInterval(pull, 90_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return height;
}
