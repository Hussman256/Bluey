import { fileURLToPath } from 'node:url';

export const config = {
  /** WebSocket + HTTP port for the index API. */
  port: Number(process.env.PORT ?? 8787),

  /** Where the SQLite file lives. */
  dbPath:
    process.env.DB_PATH ?? fileURLToPath(new URL('../data/index.db', import.meta.url)),

  /** Relays to ingest the firehose from. */
  relays: (process.env.RELAYS ??
    'wss://relay.damus.io,wss://relay.primal.net,wss://nos.lol,wss://relay.nostr.band,wss://nostr.wine')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  /** Only keep events newer than this many days (rolling window). */
  retentionDays: Number(process.env.RETENTION_DAYS ?? 21),

  /** Recompute web-of-trust scores this often. */
  wotIntervalMs: Number(process.env.WOT_INTERVAL_MS ?? 10 * 60 * 1000),

  /** Prune old events this often. */
  pruneIntervalMs: 60 * 60 * 1000,
};
