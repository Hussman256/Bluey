# @1btc/server — index service

The performance spine. Ingests the Nostr firehose from a relay set into SQLite,
derives the follow graph, engagement edges, mentions and profiles, computes a
global web-of-trust score (PageRank over follows), and serves fast pre-joined
queries to the client over one WebSocket.

Phase 1 works without this. Phase 2 adds it for: a ranked Discover feed,
Notifications, and Search.

## Run

```bash
npm run dev:server        # from repo root — tsx watch, :8787
# or
npm run start --workspace @1btc/server
```

No build step and no native modules: uses Node's built-in `node:sqlite`
(`--experimental-sqlite`) and `tsx`. Node 24+.

Health + stats: `GET http://localhost:8787/health`

## Protocol

One WebSocket. Client sends `{ id, method, params }`, server replies with one
`{ id, done: true, events? | counts? | notifications? | score?, error? }` frame.
Types live in `@1btc/shared` (`api.ts`).

Methods: `feed` · `thread` · `profile` · `notes` · `notifications` · `search` ·
`counts` · `wot`.

## Storage

`data/index.db` (gitignored). Tables: `events`, `profiles`, `follows`, `edges`
(reactions/reposts/replies/zaps by target), `mentions`, `wot`. FTS5 is used for
search when the SQLite build provides it, else a `LIKE` fallback.

Events older than `RETENTION_DAYS` (default 21) are pruned hourly; kind 0/3 are
kept indefinitely.

## Production notes

- Swap `node:sqlite` for Postgres when a single node isn't enough — the query
  layer is small and isolated in `queries.ts`.
- Run behind a TLS-terminating proxy; point the client at `wss://…` via
  `VITE_INDEX_URL`.
- The WoT recompute is in-memory power iteration; fine to ~1M follow edges.
