import {
  KIND,
  isSpamContent,
  type EngagementCount,
  type FeedParams,
  type NostrEventLike,
  type NotificationItem,
  type PersonCard,
  type TrendingTimeframe,
} from '@bluey/shared';
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
export function feed(params: FeedParams): NostrEventLike[] {
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

  if (params.scope === 'trending') {
    const timeframeHours: Record<TrendingTimeframe, number> = {
      '4h': 4,
      '12h': 12,
      '24h': 24,
      '7d': 168,
    };
    const hours = timeframeHours[params.timeframe ?? '24h'] ?? 24;
    const since = until - hours * 3600;

    // Pick the 500 candidates by trust, then engagement, across the whole window.
    // Taking the newest 500 would shrink 24h and 7d to the last few hours on a busy index.
    const candidates = q
      .all<Row & { wot: number; zap_sats: number; replies: number; reactions: number; reposts: number }>(
        `SELECT e.*, COALESCE(w.score, 0) AS wot,
                COALESCE(g.zap_sats, 0) AS zap_sats,
                COALESCE(g.replies, 0) AS replies,
                COALESCE(g.reactions, 0) AS reactions,
                COALESCE(g.reposts, 0) AS reposts
         FROM events e
         LEFT JOIN wot w ON w.pubkey = e.pubkey
         LEFT JOIN (
           SELECT target_id,
                  SUM(CASE WHEN kind=${KIND.ZapReceipt} THEN sats ELSE 0 END) AS zap_sats,
                  SUM(kind=${KIND.Text}) AS replies,
                  SUM(kind=${KIND.Reaction}) AS reactions,
                  SUM(kind IN (${KIND.Repost}, ${KIND.GenericRepost})) AS reposts
           FROM edges WHERE created_at >= ? GROUP BY target_id
         ) g ON g.target_id = e.id
         WHERE e.kind = ${KIND.Text} AND e.is_reply = 0 AND e.created_at >= ? AND e.created_at < ?
         ORDER BY COALESCE(w.score, 0) > 0 DESC,
                  COALESCE(g.zap_sats, 0) / 250.0 + COALESCE(g.replies, 0) * 3
                    + COALESCE(g.reposts, 0) * 2.5 + COALESCE(g.reactions, 0) DESC,
                  e.created_at DESC
         LIMIT 500`,
        since,
        since,
        until,
      )
      .filter((r) => r.kind !== KIND.Text || !isSpamContent(r.content));

    const trusted = params.pubkey ? trustSet(params.pubkey) : new Set<string>();
    const now = Date.now() / 1000;

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

    const rankTrending = (minWot: number) =>
      candidates
        .filter((r) => !flagged(r) && (trusted.has(r.pubkey) || r.wot >= minWot))
        .map((r) => {
          // age counts relative to the window: a 3-day-old post is "recent" on 7d,
          // so 7d ranks the week's biggest posts rather than whatever is newest
          const ageH = Math.max(0.1, (now - r.created_at) / 3600) * (24 / hours);
          const engPoints = (r.zap_sats / 250) + (r.replies * 3) + (r.reposts * 2.5) + (r.reactions * 1);
          const velocity = (engPoints + 0.5) / Math.pow(ageH + 1, 1.25);
          const trustBoost = trusted.has(r.pubkey) ? 1.5 : Math.max(0.05, r.wot);
          return { r, score: velocity * trustBoost };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

    let ranked = rankTrending(trusted.size < 15 ? 0.05 : 0.01);
    if (ranked.length < 5) ranked = rankTrending(0);
    return ranked.map((x) => toEvent(x.r));
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

// ---------- people ----------
export function people(raw: string, limit = 8): PersonCard[] {
  const term = raw.trim().replace(/^@/, '').slice(0, 40);
  if (!term) return [];
  const like = term.replace(/[\\%_]/g, '\\$&');
  return q
    .all<{ pubkey: string; name: string | null; display_name: string | null; picture: string | null; nip05: string | null }>(
      `SELECT p.pubkey, p.name, p.display_name, p.picture, p.nip05
       FROM profiles p LEFT JOIN wot w ON w.pubkey = p.pubkey
       WHERE p.name LIKE ? ESCAPE '\\' OR p.display_name LIKE ? ESCAPE '\\'
          OR p.display_name LIKE ? ESCAPE '\\' OR p.nip05 LIKE ? ESCAPE '\\'
       ORDER BY COALESCE(w.score, 0) DESC LIMIT ?`,
      `${like}%`,
      `${like}%`,
      `% ${like}%`,
      `${like}%`,
      Math.min(limit, 20),
    )
    .map((r) => ({
      pubkey: r.pubkey,
      name: r.name,
      displayName: r.display_name,
      picture: r.picture,
      nip05: r.nip05,
    }));
}

export function followers(pubkey: string, limit = 200): { total: number; pubkeys: string[] } {
  const total = q.get<{ n: number }>(`SELECT COUNT(*) n FROM follows WHERE followee = ?`, pubkey)?.n ?? 0;
  const pubkeys = q
    .all<{ follower: string }>(
      `SELECT f.follower FROM follows f LEFT JOIN wot w ON w.pubkey = f.follower
       WHERE f.followee = ? ORDER BY COALESCE(w.score, 0) DESC LIMIT ?`,
      pubkey,
      Math.min(limit, 500),
    )
    .map((r) => r.follower);
  return { total, pubkeys };
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

// ---------- accounts: passkey key backups, names, onboarding suggestions ----------

export interface KeyBackup {
  pubkey: string;
  blob: string;
}

export function keyBackup(credentialId: string): KeyBackup | undefined {
  return q.get<KeyBackup>(
    `SELECT pubkey, blob FROM key_backups WHERE credential_id = ?`,
    credentialId,
  );
}

/** Store a backup; an existing credential id can only be rewritten by the same pubkey. */
export function saveKeyBackup(credentialId: string, pubkey: string, blob: string): boolean {
  const prev = keyBackup(credentialId);
  if (prev && prev.pubkey !== pubkey) return false;
  const now = Math.floor(Date.now() / 1000);
  q.run(
    `INSERT INTO key_backups (credential_id, pubkey, blob, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(credential_id) DO UPDATE SET blob = excluded.blob, updated_at = excluded.updated_at`,
    credentialId,
    pubkey,
    blob,
    now,
    now,
  );
  return true;
}

export interface NameRow {
  name: string;
  pubkey: string;
  ln_target: string | null;
}

export const nameByName = (name: string) =>
  q.get<NameRow>(`SELECT name, pubkey, ln_target FROM names WHERE name = ?`, name);

export const nameByPubkey = (pubkey: string) =>
  q.get<NameRow>(`SELECT name, pubkey, ln_target FROM names WHERE pubkey = ?`, pubkey);

export const profileCard = (pubkey: string) =>
  q.get<{ name: string | null; display_name: string | null; about: string | null; picture: string | null }>(
    `SELECT name, display_name, about, picture FROM profiles WHERE pubkey = ?`,
    pubkey,
  );

/**
 * Claim (or rename to) `name` for `pubkey`, and set where its Lightning address
 * forwards. Returns false when someone else holds the name.
 */
export function claimName(name: string, pubkey: string, lnTarget: string | null): boolean {
  const taken = nameByName(name);
  if (taken && taken.pubkey !== pubkey) return false;
  const now = Math.floor(Date.now() / 1000);
  q.run(`DELETE FROM names WHERE pubkey = ? AND name <> ?`, pubkey, name);
  q.run(
    `INSERT INTO names (name, pubkey, ln_target, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET ln_target = excluded.ln_target, updated_at = excluded.updated_at`,
    name,
    pubkey,
    lnTarget,
    now,
    now,
  );
  return true;
}

/** Words that mark a profile as being about a topic, for onboarding suggestions. */
const TOPIC_WORDS: Record<string, string[]> = {
  bitcoin: ['bitcoin', 'btc', 'sats'],
  lightning: ['lightning', 'lnd', 'zap'],
  nostr: ['nostr'],
  code: ['developer', 'engineer', 'programmer', 'coder', 'dev '],
  design: ['design', 'designer', 'ux', 'ui '],
  business: ['founder', 'business', 'startup', 'entrepreneur'],
};

/**
 * Well-trusted accounts for a set of interests: highest web-of-trust score among
 * profiles whose bio mentions the topic, padded with the most trusted overall.
 */
export function suggestPubkeys(topics: string[], limit = 24): string[] {
  const words = topics.flatMap((t) => TOPIC_WORDS[t] ?? []).slice(0, 24);
  const out: string[] = [];
  if (words.length) {
    const where = words.map(() => `lower(coalesce(p.about, '') || ' ' || coalesce(p.name, '')) LIKE ?`).join(' OR ');
    out.push(
      ...q
        .all<{ pubkey: string }>(
          `SELECT w.pubkey FROM wot w JOIN profiles p ON p.pubkey = w.pubkey
           WHERE p.name IS NOT NULL AND (${where})
           ORDER BY w.score DESC LIMIT ?`,
          ...words.map((w) => `%${w}%`),
          limit,
        )
        .map((r) => r.pubkey),
    );
  }
  if (out.length < limit) {
    for (const r of q.all<{ pubkey: string }>(
      `SELECT w.pubkey FROM wot w JOIN profiles p ON p.pubkey = w.pubkey
       WHERE p.name IS NOT NULL ORDER BY w.score DESC LIMIT ?`,
      limit * 2,
    )) {
      if (out.length >= limit) break;
      if (!out.includes(r.pubkey)) out.push(r.pubkey);
    }
  }
  return out;
}

// ---------- learning: quizzes, attempts, completion awards ----------

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
  explain?: string;
}

export interface QuizRow {
  lesson_addr: string;
  bootcamp_addr: string;
  bootcamp_title: string;
  questions: QuizQuestion[];
  pass_mark: number;
}

const toQuiz = (r: Omit<QuizRow, 'questions'> & { questions: string }): QuizRow => ({
  ...r,
  questions: JSON.parse(r.questions),
});

export function quizFor(lessonAddr: string): QuizRow | undefined {
  const r = q.get<Omit<QuizRow, 'questions'> & { questions: string }>(
    `SELECT lesson_addr, bootcamp_addr, bootcamp_title, questions, pass_mark FROM quizzes WHERE lesson_addr = ?`,
    lessonAddr,
  );
  return r && toQuiz(r);
}

export const quizLessonsIn = (bootcampAddr: string) =>
  q.all<{ lesson_addr: string }>(`SELECT lesson_addr FROM quizzes WHERE bootcamp_addr = ?`, bootcampAddr).map(
    (r) => r.lesson_addr,
  );

export function saveQuiz(row: QuizRow) {
  q.run(
    `INSERT INTO quizzes (lesson_addr, bootcamp_addr, bootcamp_title, questions, pass_mark, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(lesson_addr) DO UPDATE SET bootcamp_addr = excluded.bootcamp_addr,
       bootcamp_title = excluded.bootcamp_title, questions = excluded.questions,
       pass_mark = excluded.pass_mark, updated_at = excluded.updated_at`,
    row.lesson_addr,
    row.bootcamp_addr,
    row.bootcamp_title,
    JSON.stringify(row.questions),
    row.pass_mark,
    Math.floor(Date.now() / 1000),
  );
}

export const deleteQuiz = (lessonAddr: string) => q.run(`DELETE FROM quizzes WHERE lesson_addr = ?`, lessonAddr);

/** Keep the learner's best attempt (a pass is never undone by a later, worse try). */
export function recordAttempt(lessonAddr: string, pubkey: string, score: number, total: number, passed: boolean) {
  q.run(
    `INSERT INTO quiz_attempts (lesson_addr, pubkey, score, total, passed, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(lesson_addr, pubkey) DO UPDATE SET
       score = max(score, excluded.score), total = excluded.total,
       passed = max(passed, excluded.passed), updated_at = excluded.updated_at`,
    lessonAddr,
    pubkey,
    score,
    total,
    passed ? 1 : 0,
    Math.floor(Date.now() / 1000),
  );
}

export function attemptsIn(bootcampAddr: string, pubkey: string) {
  return q.all<{ lesson_addr: string; score: number; total: number; passed: number }>(
    `SELECT a.lesson_addr, a.score, a.total, a.passed FROM quiz_attempts a
     JOIN quizzes z ON z.lesson_addr = a.lesson_addr
     WHERE z.bootcamp_addr = ? AND a.pubkey = ?`,
    bootcampAddr,
    pubkey,
  );
}

export const awardFor = (bootcampAddr: string, pubkey: string) =>
  q.get<{ award_id: string }>(
    `SELECT award_id FROM quiz_awards WHERE bootcamp_addr = ? AND pubkey = ?`,
    bootcampAddr,
    pubkey,
  )?.award_id;

export const saveAward = (bootcampAddr: string, pubkey: string, awardId: string) =>
  q.run(
    `INSERT OR IGNORE INTO quiz_awards (bootcamp_addr, pubkey, award_id, created_at) VALUES (?, ?, ?, ?)`,
    bootcampAddr,
    pubkey,
    awardId,
    Math.floor(Date.now() / 1000),
  );
