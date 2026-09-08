import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { KIND, type NostrEventLike } from '@1btc/shared';
import { config } from './config.ts';

mkdirSync(dirname(config.dbPath), { recursive: true });

export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = NORMAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id          TEXT PRIMARY KEY,
    pubkey      TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    kind        INTEGER NOT NULL,
    content     TEXT NOT NULL,
    tags        TEXT NOT NULL,
    sig         TEXT NOT NULL,
    is_reply    INTEGER NOT NULL DEFAULT 0,
    ingested_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ix_events_kind_time  ON events (kind, created_at DESC);
  CREATE INDEX IF NOT EXISTS ix_events_pk_kind    ON events (pubkey, kind, created_at DESC);

  CREATE TABLE IF NOT EXISTS profiles (
    pubkey       TEXT PRIMARY KEY,
    name         TEXT,
    display_name TEXT,
    about        TEXT,
    picture      TEXT,
    nip05        TEXT,
    lud16        TEXT,
    updated_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS follows (
    follower TEXT NOT NULL,
    followee TEXT NOT NULL,
    PRIMARY KEY (follower, followee)
  );
  CREATE INDEX IF NOT EXISTS ix_follows_followee ON follows (followee);
  CREATE INDEX IF NOT EXISTS ix_follows_follower ON follows (follower);

  CREATE TABLE IF NOT EXISTS edges (
    src_id     TEXT NOT NULL,
    target_id  TEXT NOT NULL,
    kind       INTEGER NOT NULL,
    pubkey     TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    sats       INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (src_id, target_id)
  );
  CREATE INDEX IF NOT EXISTS ix_edges_target ON edges (target_id, kind);
  CREATE INDEX IF NOT EXISTS ix_edges_actor  ON edges (target_id, pubkey);

  CREATE TABLE IF NOT EXISTS mentions (
    event_id   TEXT NOT NULL,
    pubkey     TEXT NOT NULL,
    author     TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (event_id, pubkey)
  );
  CREATE INDEX IF NOT EXISTS ix_mentions_pubkey ON mentions (pubkey, created_at DESC);

  CREATE TABLE IF NOT EXISTS wot (
    pubkey     TEXT PRIMARY KEY,
    score      REAL NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reports (
    reporter   TEXT NOT NULL,
    target     TEXT NOT NULL,   -- reported event id or pubkey
    ref        TEXT NOT NULL,   -- 'e' or 'p'
    type       TEXT,            -- NIP-56 report type
    created_at INTEGER NOT NULL,
    PRIMARY KEY (reporter, target)
  );
  CREATE INDEX IF NOT EXISTS ix_reports_target ON reports (target);

  CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
`);

// ---- typed query helpers with a prepared-statement cache ----
type SqlParam = string | number | bigint | null | Uint8Array;
const stmtCache = new Map<string, ReturnType<typeof db.prepare>>();
function prep(sql: string) {
  let s = stmtCache.get(sql);
  if (!s) {
    s = db.prepare(sql);
    stmtCache.set(sql, s);
  }
  return s;
}
export const q = {
  all: <T>(sql: string, ...p: SqlParam[]): T[] => prep(sql).all(...p) as unknown as T[],
  get: <T>(sql: string, ...p: SqlParam[]): T | undefined =>
    prep(sql).get(...p) as unknown as T | undefined,
};

/** FTS5 is optional — fall back to LIKE search if the build lacks it. */
export let ftsAvailable = false;
try {
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS note_fts USING fts5(id UNINDEXED, content)`);
  ftsAvailable = true;
} catch {
  ftsAvailable = false;
}

// ---- prepared statements ----
const ins = db.prepare(`
  INSERT OR IGNORE INTO events (id, pubkey, created_at, kind, content, tags, sig, is_reply, ingested_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insFts = ftsAvailable
  ? db.prepare(`INSERT INTO note_fts (id, content) VALUES (?, ?)`)
  : null;
const upProfile = db.prepare(`
  INSERT INTO profiles (pubkey, name, display_name, about, picture, nip05, lud16, updated_at)
  VALUES (@pubkey, @name, @display_name, @about, @picture, @nip05, @lud16, @updated_at)
  ON CONFLICT(pubkey) DO UPDATE SET
    name=@name, display_name=@display_name, about=@about, picture=@picture,
    nip05=@nip05, lud16=@lud16, updated_at=@updated_at
  WHERE excluded.updated_at > profiles.updated_at
`);
const delFollows = db.prepare(`DELETE FROM follows WHERE follower = ?`);
const insFollow = db.prepare(`INSERT OR IGNORE INTO follows (follower, followee) VALUES (?, ?)`);
const insEdge = db.prepare(`
  INSERT OR IGNORE INTO edges (src_id, target_id, kind, pubkey, created_at, sats)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const insMention = db.prepare(`
  INSERT OR IGNORE INTO mentions (event_id, pubkey, author, created_at) VALUES (?, ?, ?, ?)
`);
const insReport = db.prepare(`
  INSERT OR IGNORE INTO reports (reporter, target, ref, type, created_at) VALUES (?, ?, ?, ?, ?)
`);
const getFollowTs = db.prepare(`SELECT v FROM meta WHERE k = ?`);
const setFollowTs = db.prepare(`INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)`);

const REPLY_TAGS = new Set(['e', 'a', 'q']);

function bolt11Sats(tags: string[][]): number {
  // amount tag (millisats) is the reliable one for a zap receipt
  const amount = tags.find((t) => t[0] === 'amount')?.[1];
  if (amount && /^\d+$/.test(amount)) return Math.round(Number(amount) / 1000);
  return 0;
}

/** Store one validated event and derive graph/edge/profile rows from it. */
export function ingest(ev: NostrEventLike): boolean {
  const isReply =
    ev.kind === KIND.Text && ev.tags.some((t) => REPLY_TAGS.has(t[0])) ? 1 : 0;

  const changed = ins.run(
    ev.id,
    ev.pubkey,
    ev.created_at,
    ev.kind,
    ev.content,
    JSON.stringify(ev.tags),
    ev.sig,
    isReply,
    Math.floor(Date.now() / 1000),
  ).changes;
  if (!changed) return false;

  if (ev.kind === KIND.Text) {
    if (insFts) insFts.run(ev.id, ev.content);
    // mentions
    for (const t of ev.tags) {
      if (t[0] === 'p' && /^[0-9a-f]{64}$/.test(t[1] ?? '') && t[1] !== ev.pubkey) {
        insMention.run(ev.id, t[1], ev.pubkey, ev.created_at);
      }
    }
    // reply edge
    if (isReply) {
      const target =
        ev.tags.find((t) => t[0] === 'e' && t[3] === 'reply')?.[1] ??
        ev.tags.find((t) => t[0] === 'e' && t[3] === 'root')?.[1] ??
        ev.tags.filter((t) => t[0] === 'e').pop()?.[1];
      if (target) insEdge.run(ev.id, target, KIND.Text, ev.pubkey, ev.created_at, 0);
    }
  } else if (ev.kind === KIND.Metadata) {
    try {
      const p = JSON.parse(ev.content) as Record<string, string>;
      upProfile.run({
        pubkey: ev.pubkey,
        name: p.name ?? null,
        display_name: p.display_name ?? p.displayName ?? null,
        about: p.about ?? null,
        picture: p.picture ?? null,
        nip05: p.nip05 ?? null,
        lud16: p.lud16 ?? null,
        updated_at: ev.created_at,
      });
    } catch {
      /* malformed profile */
    }
  } else if (ev.kind === KIND.Contacts) {
    // replace the follow set only if this kind-3 is newer than the one we have
    const k = `follow_ts:${ev.pubkey}`;
    const prev = Number((getFollowTs.get(k) as { v: string } | undefined)?.v ?? 0);
    if (ev.created_at >= prev) {
      delFollows.run(ev.pubkey);
      for (const t of ev.tags) {
        if (t[0] === 'p' && /^[0-9a-f]{64}$/.test(t[1] ?? '')) insFollow.run(ev.pubkey, t[1]);
      }
      setFollowTs.run(k, String(ev.created_at));
    }
  } else if (ev.kind === KIND.Reaction || ev.kind === KIND.Repost || ev.kind === KIND.GenericRepost) {
    const target = ev.tags.filter((t) => t[0] === 'e').pop()?.[1];
    if (target) insEdge.run(ev.id, target, ev.kind, ev.pubkey, ev.created_at, 0);
  } else if (ev.kind === KIND.Report) {
    // NIP-56: ["e", <id>, <type>] and/or ["p", <pubkey>, <type>]
    for (const t of ev.tags) {
      if ((t[0] === 'e' || t[0] === 'p') && /^[0-9a-f]{64}$/.test(t[1] ?? '')) {
        const type = t[2] || t[3] || null;
        insReport.run(ev.pubkey, t[1], t[0], type, ev.created_at);
      }
    }
  } else if (ev.kind === KIND.ZapReceipt) {
    const target = ev.tags.find((t) => t[0] === 'e')?.[1];
    const zapper = ev.tags.find((t) => t[0] === 'P')?.[1] ?? ev.pubkey;
    let sats = bolt11Sats(ev.tags);
    if (!sats) {
      // fall back to the embedded zap request
      try {
        const req = JSON.parse(ev.tags.find((t) => t[0] === 'description')?.[1] ?? '{}');
        sats = bolt11Sats(req.tags ?? []);
      } catch {
        /* ignore */
      }
    }
    if (target) insEdge.run(ev.id, target, KIND.ZapReceipt, zapper, ev.created_at, sats);
  }

  return true;
}

export function pruneOld(): number {
  const cutoff = Math.floor(Date.now() / 1000) - config.retentionDays * 86400;
  const n = db.prepare(`DELETE FROM events WHERE created_at < ? AND kind NOT IN (0, 3)`).run(cutoff)
    .changes;
  db.prepare(`DELETE FROM edges WHERE created_at < ?`).run(cutoff);
  db.prepare(`DELETE FROM mentions WHERE created_at < ?`).run(cutoff);
  db.prepare(`DELETE FROM reports WHERE created_at < ?`).run(cutoff);
  if (ftsAvailable) {
    db.exec(
      `DELETE FROM note_fts WHERE id NOT IN (SELECT id FROM events WHERE kind = ${KIND.Text})`,
    );
  }
  return Number(n);
}

export function stats() {
  const one = (sql: string) => Number((db.prepare(sql).get() as { n: number }).n);
  return {
    events: one('SELECT count(*) n FROM events'),
    profiles: one('SELECT count(*) n FROM profiles'),
    follows: one('SELECT count(*) n FROM follows'),
    edges: one('SELECT count(*) n FROM edges'),
    scored: one('SELECT count(*) n FROM wot'),
  };
}
