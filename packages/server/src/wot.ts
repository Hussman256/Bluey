import { db, q } from './db.ts';

const DAMPING = 0.85;
const ITERATIONS = 12;

/**
 * Global web-of-trust via PageRank over the follow graph.
 * Accounts nobody real follows converge to ~0, so they drop out of ranked
 * feeds without any manual blocklist. Personalisation (the viewer's own
 * follows-of-follows) is layered on at query time in api.ts.
 */
export function recomputeWot(): { nodes: number; ms: number } {
  const t0 = Date.now();

  const followers = new Map<string, string[]>(); // followee -> [followers]
  const outDeg = new Map<string, number>(); // follower -> count
  const nodes = new Set<string>();

  const rows = q.all<{ follower: string; followee: string }>(
    `SELECT follower, followee FROM follows`,
  );
  for (const row of rows) {
    nodes.add(row.follower);
    nodes.add(row.followee);
    outDeg.set(row.follower, (outDeg.get(row.follower) ?? 0) + 1);
    const arr = followers.get(row.followee);
    if (arr) arr.push(row.follower);
    else followers.set(row.followee, [row.follower]);
  }

  const n = nodes.size;
  if (n === 0) return { nodes: 0, ms: Date.now() - t0 };

  const base = (1 - DAMPING) / n;
  let rank = new Map<string, number>();
  for (const node of nodes) rank.set(node, 1 / n);

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const next = new Map<string, number>();
    let dangling = 0;
    for (const node of nodes) {
      if ((outDeg.get(node) ?? 0) === 0) dangling += rank.get(node) ?? 0;
    }
    const danglingShare = (DAMPING * dangling) / n;
    for (const node of nodes) {
      let sum = 0;
      const fs = followers.get(node);
      if (fs) {
        for (const f of fs) sum += (rank.get(f) ?? 0) / (outDeg.get(f) || 1);
      }
      next.set(node, base + danglingShare + DAMPING * sum);
    }
    rank = next;
  }

  // normalise to 0..1 against the top score
  let max = 0;
  for (const v of rank.values()) if (v > max) max = v;
  const now = Math.floor(Date.now() / 1000);

  const upsert = db.prepare(`
    INSERT INTO wot (pubkey, score, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(pubkey) DO UPDATE SET score = excluded.score, updated_at = excluded.updated_at
  `);
  db.exec('BEGIN');
  try {
    for (const [pk, v] of rank) upsert.run(pk, max > 0 ? v / max : 0, now);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  return { nodes: n, ms: Date.now() - t0 };
}
