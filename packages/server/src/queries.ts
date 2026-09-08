import {
  KIND,
  isSpamContent,
  type EngagementCount,
  type NostrEventLike,
  type NotificationItem,
} from '@1btc/shared';
import { ftsAvailable, q } from './db.ts';

interface Row {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  content: string;
  tags: string;
  sig: string;
}

const toEvent = (r: Row): NostrEventLike => ({
  id: r.id,
  pubkey: r.pubkey,
  created_at: r.created_at,
  kind: r.kind,
  content: r.content,
  tags: JSON.parse(r.tags),
  sig: r.sig,
});

const emptyCount = (id: string): EngagementCount => ({
  id,
  replies: 0,
  reactions: 0,
  reposts: 0,
  zapCount: 0,
  zapSats: 0,
});

// ---------- engagement counts ----------
const COUNT_SQL = `
  SELECT
    target_id AS id,
    SUM(kind = ${KIND.Text})       AS replies,
    SUM(kind = ${KIND.Reaction})   AS reactions,
    SUM(kind IN (${KIND.Repost}, ${KIND.GenericRepost})) AS reposts,
    SUM(kind = ${KIND.ZapReceipt}) AS zapCount,
    COALESCE(SUM(CASE WHEN kind = ${KIND.ZapReceipt} THEN sats ELSE 0 END), 0) AS zapSats
  FROM edges WHERE target_id = ? GROUP BY target_id`;

export function counts(ids: string[]): EngagementCount[] {
  return ids.map((id) => q.get<EngagementCount>(COUNT_SQL, id) ?? emptyCount(id));
}

// ---------- viewer trust set (follows + follows-of-follows) ----------
function trustSet(pubkey: string): Set<string> {
  const set = new Set<string>();
  const direct = q.all<{ followee: string }>(
    `SELECT followee FROM follows WHERE follower = ?`,
    pubkey,
  );
  for (const d of direct) set.add(d.followee);
  if (direct.length) {
    const ph = direct.map(() => '?').join(',');
    const second = q.all<{ followee: string }>(
      `SELECT DISTINCT followee FROM follows WHERE follower IN (${ph})`,
      ...direct.map((d) => d.followee),
    );
    for (const s of second) set.add(s.followee);
  }
  return set;
}

// ---------- feed ----------
export function feed(params: {
  scope: 'discover' | 'following';
  pubkey?: string;
  limit?: number;
  until?: number;
}): NostrEventLike[] {
  const limit = Math.min(params.limit ?? 60, 150);
  const until = params.until ?? Math.floor(Date.now() / 1000) + 60;

  if (params.scope === 'following' && params.pubkey) {
    return q
      .all<Row>(
        `SELECT e.* FROM events e
         JOIN follows f ON f.followee = e.pubkey AND f.follower = ?
         WHERE e.kind IN (${KIND.Text}, ${KIND.Repost}) AND e.is_reply = 0 AND e.created_at < ?
         ORDER BY e.created_at DESC LIMIT ?`,
        params.pubkey,
        until,
        limit,
      )
      .map(toEvent);
  }

  const candidates = q
    .all<Row & { wot: number; eng: number }>(
      `SELECT e.*, COALESCE(w.score, 0) AS wot,
            (SELECT COALESCE(SUM(CASE WHEN kind=${KIND.ZapReceipt} THEN sats ELSE 0 END), 0)
                   + COUNT(*) FROM edges WHERE target_id = e.id) AS eng
     FROM events e
     LEFT JOIN wot w ON w.pubkey = e.pubkey
     WHERE e.kind IN (${KIND.Text}, ${KIND.Repost}) AND e.is_reply = 0 AND e.created_at < ?
     ORDER BY e.created_at DESC LIMIT 600`,
      until,
    )
    .filter((r) => r.kind !== KIND.Text || !isSpamContent(r.content));

  const trusted = params.pubkey ? trustSet(params.pubkey) : new Set<string>();
  const now = Date.now() / 1000;

  // NIP-56 reports: an event id or author is suppressed once reporters carry
  // enough web-of-trust weight between them (sybil-resistant) or enough
  // distinct real accounts have flagged it.
  const reported = new Set(
    q
      .all<{ target: string }>(
        `SELECT r.target
         FROM reports r
         LEFT JOIN wot w ON w.pubkey = r.reporter
         GROUP BY r.target
         HAVING COALESCE(SUM(w.score), 0) >= 0.10
             OR SUM(CASE WHEN w.score > 0 THEN 1 ELSE 0 END) >= 3`,
      )
      .map((r) => r.target),
  );
  const flagged = (r: Row) => reported.has(r.id) || reported.has(r.pubkey);

  // A viewer with a real follow graph gets follows-of-follows ranking. A viewer
  // with almost no follows (brand-new / logged-out) has no trust root, so we
  // must NOT fall back to the raw firehose — require a real global web-of-trust
  // score instead, and only relax that if it would leave the feed near-empty.
  const coldStart = trusted.size < 15;
  const MIN_WOT = 0.12;

  const rank = (minWot: number) =>
    candidates
      .filter((r) => !flagged(r) && (trusted.has(r.pubkey) || r.wot >= minWot))
      .map((r) => {
        const ageH = Math.max(0.1, (now - r.created_at) / 3600);
        const recency = 1 / (1 + ageH / 8);
        const trustBoost = trusted.has(r.pubkey) ? 1.5 : r.wot;
        const engagement = 1 + Math.log1p(r.eng);
        return { r, score: trustBoost * recency * engagement };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

  let ranked = rank(coldStart ? MIN_WOT : 0.02);
  if (ranked.length < 8) ranked = rank(0); // network genuinely too thin — show what we have
  return ranked.map((x) => toEvent(x.r));
}

// ---------- thread ----------
export function thread(id: string, limit = 200): NostrEventLike[] {
  const root = q.get<Row>(`SELECT * FROM events WHERE id = ?`, id);
  const replies = q
    .all<Row>(
      `SELECT e.* FROM events e JOIN edges g ON g.src_id = e.id
       WHERE g.target_id = ? AND g.kind = ${KIND.Text}
       ORDER BY e.created_at ASC LIMIT ?`,
      id,
      limit,
    )
    .map(toEvent);
  return root ? [toEvent(root), ...replies] : replies;
}

// ---------- profile ----------
export function profile(pubkey: string): {
  events: NostrEventLike[];
  counts: EngagementCount[];
} {
  const meta = q.get<Row>(`SELECT * FROM events WHERE pubkey = ? AND kind = 0`, pubkey);
  const followers =
    q.get<{ n: number }>(`SELECT COUNT(*) n FROM follows WHERE followee = ?`, pubkey)?.n ?? 0;
  const following =
    q.get<{ n: number }>(`SELECT COUNT(*) n FROM follows WHERE follower = ?`, pubkey)?.n ?? 0;
  const zaps = q.get<{ c: number; s: number }>(
    `SELECT COUNT(*) c, COALESCE(SUM(g.sats),0) s FROM edges g
     JOIN events t ON t.id = g.target_id
     WHERE t.pubkey = ? AND g.kind = ${KIND.ZapReceipt}`,
    pubkey,
  );

  return {
    events: meta ? [toEvent(meta)] : [],
    counts: [
      {
        id: pubkey,
        replies: following,
        reactions: followers,
        reposts: 0,
        zapCount: Number(zaps?.c ?? 0),
        zapSats: Number(zaps?.s ?? 0),
      },
    ],
  };
}

// ---------- long-form ----------
export function notes(params: {
  pubkey?: string;
  scope?: 'all' | 'following';
  limit?: number;
  until?: number;
}): NostrEventLike[] {
  const limit = Math.min(params.limit ?? 40, 100);
  const until = params.until ?? Math.floor(Date.now() / 1000) + 60;
  if (params.scope === 'following' && params.pubkey) {
    return q
      .all<Row>(
        `SELECT e.* FROM events e JOIN follows f ON f.followee = e.pubkey AND f.follower = ?
         WHERE e.kind = ${KIND.Article} AND e.created_at < ? ORDER BY e.created_at DESC LIMIT ?`,
        params.pubkey,
        until,
        limit,
      )
      .map(toEvent);
  }
  return q
    .all<Row>(
      `SELECT * FROM events WHERE kind = ${KIND.Article} AND content != '' AND created_at < ?
       ORDER BY created_at DESC LIMIT ?`,
      until,
      limit,
    )
    .map(toEvent);
}

// ---------- notifications ----------
export function notifications(pubkey: string, since = 0, limit = 60): NotificationItem[] {
  const edges = q.all<{
    src_id: string;
    kind: number;
    pubkey: string;
    created_at: number;
    target_id: string;
    sats: number;
  }>(
    `SELECT g.src_id, g.kind, g.pubkey, g.created_at, g.target_id, g.sats
     FROM edges g JOIN events t ON t.id = g.target_id
     WHERE t.pubkey = ? AND g.pubkey != ? AND g.created_at > ?
     ORDER BY g.created_at DESC LIMIT ?`,
    pubkey,
    pubkey,
    since,
    limit,
  );

  const mentions = q.all<{
    event_id: string;
    author: string;
    created_at: number;
    content: string;
  }>(
    `SELECT m.event_id, m.author, m.created_at, e.content
     FROM mentions m JOIN events e ON e.id = m.event_id
     WHERE m.pubkey = ? AND m.author != ? AND m.created_at > ?
     ORDER BY m.created_at DESC LIMIT ?`,
    pubkey,
    pubkey,
    since,
    limit,
  );

  const items: NotificationItem[] = [
    ...edges.map((r) => ({
      id: r.src_id,
      kind: r.kind,
      pubkey: r.pubkey,
      created_at: r.created_at,
      targetId: r.target_id,
      zapSats: r.kind === KIND.ZapReceipt ? r.sats : undefined,
    })),
    ...mentions.map((r) => ({
      id: r.event_id,
      kind: KIND.Text,
      pubkey: r.author,
      created_at: r.created_at,
      contentPreview: r.content.slice(0, 140),
    })),
  ];

  const seen = new Set<string>();
  return items
    .filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)))
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, limit);
}

// ---------- search ----------
export function search(qStr: string, limit = 40): NostrEventLike[] {
  const term = qStr.trim().slice(0, 128);
  if (!term) return [];
  if (ftsAvailable) {
    try {
      const match = term.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim() + '*';
      return q
        .all<Row>(
          `SELECT e.* FROM note_fts f JOIN events e ON e.id = f.id
           WHERE note_fts MATCH ? ORDER BY e.created_at DESC LIMIT ?`,
          match,
          limit,
        )
        .map(toEvent);
    } catch {
      /* fall through */
    }
  }
  return q
    .all<Row>(
      `SELECT * FROM events WHERE kind = ${KIND.Text} AND content LIKE ?
       ORDER BY created_at DESC LIMIT ?`,
      `%${term}%`,
      limit,
    )
    .map(toEvent);
}

// ---------- wot score ----------
export function wotScore(pubkey: string, from?: string): number {
  if (from && trustSet(from).has(pubkey)) return 1;
  return q.get<{ score: number }>(`SELECT score FROM wot WHERE pubkey = ?`, pubkey)?.score ?? 0;
}
