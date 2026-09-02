# 1btc

A builder network on **Nostr** + **Lightning**. Learn in public, ship provable
work, get zapped. Concept modelled on Zero Club; execution modelled on Primal.

## Monorepo

| Package | What |
|---|---|
| `packages/web` | The client — React 19 + Vite + Tailwind v4 + NDK 3 |
| `packages/server` | The index service — ingests the Nostr firehose into SQLite, serves fast feeds / search / notifications / web-of-trust over one WebSocket |
| `packages/shared` | Event kinds + the index wire protocol, shared by both |

## Run

```bash
npm install

# terminal 1 — the client (works standalone on public relays)
npm run dev            # http://localhost:5173

# terminal 2 — the index service (unlocks Discover ranking, Notifications, Search)
npm run dev:server     # ws + http on :8787
```

`npm run check` runs typecheck + lint across all packages. `npm run build`
builds the client.

## Status

**Phase 1 — a great Nostr client** (done): login (NIP-07 / bunker / keygen),
Following + Discover feed, threads, profiles with follow + zap, NIP-23 Reads,
media upload to Blossom, non-custodial NWC wallet, per-viewer web-of-trust
filter on Discover.

**Phase 2 — the performance spine** (done): the index service. Discover is now
ranked by a global PageRank-over-follows web-of-trust score; Notifications and
Search are served from the index. The client falls back to talking to relays
directly whenever the index is unreachable.

**Next:** Phase 3 — Clubs (NIP-29 relay-enforced groups with zap-gated entry).

See the architecture brief: *Zero Club on Nostr*.

## Wallet stance

1btc custodies nothing. Users connect a wallet they control over NWC (Zeus,
Alby Hub), or pay zap invoices manually in any wallet. See the brief for the
full rationale (Nigeria-based, non-custodial is the only safe option).
