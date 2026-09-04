import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.ts';

mkdirSync(dirname(config.dbPath), { recursive: true });

export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = NORMAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id         TEXT PRIMARY KEY,
    pubkey     TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    kind       INTEGER NOT NULL,
    content    TEXT NOT NULL,
    tags       TEXT NOT NULL,
    sig        TEXT NOT NULL,
    group_id   TEXT,
    d_tag      TEXT
  );
  CREATE INDEX IF NOT EXISTS ix_events_kind ON events (kind, created_at DESC);
  CREATE INDEX IF NOT EXISTS ix_events_group ON events (group_id, kind, created_at DESC);
  CREATE INDEX IF NOT EXISTS ix_events_addr ON events (kind, pubkey, d_tag);

  CREATE TABLE IF NOT EXISTS groups (
    id          TEXT PRIMARY KEY,
    name        TEXT,
    about       TEXT,
    picture     TEXT,
    is_open     INTEGER NOT NULL DEFAULT 1,
    is_public   INTEGER NOT NULL DEFAULT 1,
    created_by  TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS group_members (
    group_id TEXT NOT NULL,
    pubkey   TEXT NOT NULL,
    role     TEXT NOT NULL DEFAULT 'member',
    added_at INTEGER NOT NULL,
    PRIMARY KEY (group_id, pubkey)
  );
  CREATE INDEX IF NOT EXISTS ix_members_pubkey ON group_members (pubkey);
`);

type SqlParam = string | number | bigint | null | Uint8Array;
const cache = new Map<string, ReturnType<typeof db.prepare>>();
function prep(sql: string) {
  let s = cache.get(sql);
  if (!s) {
    s = db.prepare(sql);
    cache.set(sql, s);
  }
  return s;
}
export const q = {
  all: <T>(sql: string, ...p: SqlParam[]): T[] => prep(sql).all(...p) as unknown as T[],
  get: <T>(sql: string, ...p: SqlParam[]): T | undefined =>
    prep(sql).get(...p) as unknown as T | undefined,
  run: (sql: string, ...p: SqlParam[]) => prep(sql).run(...p),
};
