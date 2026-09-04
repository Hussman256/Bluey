# 1btc

A builder network on **Nostr** + **Lightning**. Learn in public, ship provable
work, get zapped. Concept modelled on Zero Club; execution modelled on Primal.

## Monorepo

| Package | What |
|---|---|
| `packages/web` | The client — React 19 + Vite + Tailwind v4 + NDK 3 |
| `packages/server` | The index service — ingests the Nostr firehose into SQLite, serves fast feeds / search / notifications / web-of-trust over one WebSocket |
| `packages/relay` | The clubs relay — a minimal NIP-29 group relay with relay-enforced membership |
| `packages/shared` | Event kinds + the index wire protocol |

## Run

```bash
npm install

npm run dev            # client — http://localhost:5173  (works standalone on public relays)
npm run dev:server     # index service — :8787  (Discover ranking, Notifications, Search)
npm run dev:relay      # clubs relay — :8788  (Clubs)
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

**Phase 3 — Clubs** (done): a NIP-29 relay with relay-enforced membership.
Browse and create clubs, join (free and open — no zap-gating in v1), member-only
group chat. Admin add/remove members and edit metadata.

**Phase 4 — Learning** (done): Bootcamps as NIP-51 curation sets (30004) whose
lessons are NIP-23 articles (30023); each bootcamp gets an auto-created cohort
Club and **enrolment = joining that club (free)**. Live classes are NIP-53 events
(30311) with an embedded stream (YouTube / Twitch / HLS) and NIP-53 live chat
(1311), gated by cohort membership. Completion badges are NIP-58 (30009 / 8),
shown on the learner's profile.

**Phase 5 — Reputation & the feed marketplace** (done):
- **Ships** — proof-of-work posts (kind 1 + `1btc:ship`) with repo/demo links;
  peers attest to them with NIP-32 `verified` labels (kind 1985).
- **Builder score** — a 0–100 composite the *client* computes from four public,
  verifiable signals (sats received, web-of-trust, badges, verified ships),
  shown with its full breakdown. Not a stored number.
- **Feed picker** — Following / Discover / Ships / Latest, plus **add any
  NIP-90 feed DVM by npub** — feeds are a marketplace.

**Phase 6 — PWA & deploy** (done): installable PWA (Workbox service worker,
offline app shell, runtime-cached fonts + media, update prompt), a
relays / index / clubs connection indicator in the sidebar, a root error
boundary, and deploy config — `vercel.json` for the client, Dockerfiles +
`docker-compose.yml` for the two services, and `DEPLOY.md`.

See **[DEPLOY.md](./DEPLOY.md)**.

See the architecture brief: *Zero Club on Nostr*.

## Wallet stance

1btc custodies nothing. Users connect a wallet they control over NWC (Zeus,
Alby Hub), or pay zap invoices manually in any wallet. See the brief for the
full rationale (Nigeria-based, non-custodial is the only safe option).
