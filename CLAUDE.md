# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Bluey is a Bitcoin social + learning app built on Nostr + Lightning (execution modelled on Primal). npm-workspaces monorepo, TypeScript throughout, Node 24+. See `README.md` for product positioning and the phase-by-phase feature history, and `DEPLOY.md` for deployment.

## Project log: `memory.md`

`memory.md` at the repo root is the running log of status, decisions, and checkpoints. Read it at the start of a session. Update it at every checkpoint (finished feature, decision, deploy, end of session): add a dated entry at the top of the "Checkpoint log" and keep the "Current status" checklists accurate.

## Commands

Run from the repo root:

```bash
npm install
npm run dev            # web client, http://localhost:5173 (works standalone on public relays)
npm run dev:server     # index service, :8787 (Discover ranking, Notifications, Search)
npm run dev:relay      # clubs relay, :8788 (Clubs)

npm run check          # typecheck all packages + oxlint the web package. Run this before committing
npm run typecheck      # tsc across all workspaces
npm run lint           # oxlint (web only)
npm run build          # typecheck all + vite build the client
npm run typecheck --workspace @bluey/server   # a single package
```

There is **no test suite** in this repo. `npm run check` is the only automated gate.

`server` and `relay` have no build step. They run TypeScript directly through `tsx` with `node --experimental-sqlite` (built-in `node:sqlite`, no native modules). Health endpoints: `GET /health` on each. `docker compose up -d` runs both backends.

## Architecture

Four packages:

- **`packages/shared`**: the source of truth for Nostr event kinds and tags (`kinds.ts`: `KIND`, `TAG`, `INGEST_KINDS`, ship label constants), the index wire protocol (`api.ts`), and spam heuristics (`spam.ts`). It is consumed as raw `.ts` (no build). `packages/web/src/nostr/kinds.ts` only re-exports it. Add new kinds here, not in the client.
- **`packages/web`**: React 19 + Vite + Tailwind v4 + NDK 3 (`@nostr-dev-kit/react`). Entry `main.tsx` mounts `NDKHeadless` (session in localStorage), then `WalletProvider` and `App`. Routes are lazy-loaded in `App.tsx`. Nostr logic lives in `src/nostr/` as plain modules plus `use*` hooks. `routes/` and `components/` are UI.
- **`packages/server`** (index service): ingests the firehose from `RELAYS` into SQLite (`events`, `profiles`, `follows`, `edges`, `mentions`, `wot`), recomputes a global PageRank-over-follows web-of-trust score every `WOT_INTERVAL_MS`, prunes non-0/3 events older than `RETENTION_DAYS`, and serves queries over one WebSocket. Every SQL query lives in `queries.ts`.
- **`packages/relay`** (clubs relay): a minimal NIP-29 group relay with relay-enforced membership. It generates and signs `39000/39001/39002` group state with its own key. The key comes from `RELAY_SECRET_KEY` (env) or else `data/relay.key`. If the key changes, every existing club is orphaned. Private groups and read gating are stubbed in `relay.ts` `handleReq`.

### Key cross-package patterns

- **Index protocol**: the client sends `{ id, method, params }` and the server replies with frames ending in `done: true` (types in `shared/src/api.ts`). Methods: `feed`, `thread`, `profile`, `notes`, `notifications`, `search`, `counts`, `wot`. To add a method, update the shared types, the server handler (`api.ts`/`queries.ts`), and the client hook (`web/src/nostr/useIndex.ts`).
- **Graceful degradation is a hard requirement.** The client must work with neither backend running. `IndexClient` (`indexClient.ts`) auto-reconnects. `useIndex*` hooks return `fromIndex: false` when the index is offline or errors, and callers then fall back to querying relays directly through NDK. Keep this fallback path whenever you touch index-backed features.
- **Feed filtering is layered.** `isSpamContent` (shared) runs server-side at ingest (`server/src/relays.ts`) and again client-side (`web/src/nostr/notes.ts` `isJunkNote`). The client then applies mute words/reports (`mutes.ts`, NIP-51/NIP-56), a script-based language filter (`lang.ts`), and NIP-36 sensitive-media blur. Spam heuristics are deliberately conservative: a normal post with a few hashtags and a link must never be caught.
- **Reputation is computed client-side from public signals** (`reputation.ts` `useVouched`) and shown as facts, not a stored score. The older 0–100 Builder score is being replaced by the "Vouched" block.
- **Learning is built from Nostr primitives**: bootcamps are NIP-51 sets (30004) of NIP-23 lessons (30023). Enrolment means joining the bootcamp's auto-created cohort club. Live classes use NIP-53 (30311/1311), badges NIP-58, Ships are kind 1 + a `bluey:ship` tag, attested with NIP-32 labels (1985).
- **Wallet is non-custodial only** (NWC or manual invoice payment). Never add custody or on/off-ramp.

### Config

- Client: `VITE_INDEX_URL`, `VITE_CLUBS_RELAY` (default `ws://localhost:8787` / `:8788`). Default relays, Blossom servers, and localStorage keys (`LS`) are in `web/src/nostr/config.ts`.
- Server: `PORT`, `DB_PATH`, `RELAYS`, `RETENTION_DAYS`, `WOT_INTERVAL_MS` (see `packages/server/.env.example`).
- Relay: `PORT`, `DB_PATH`, `KEY_PATH`, `RELAY_SECRET_KEY`, `RELAY_NAME`.

Deploy targets: the client goes to Vercel (`vercel.json`). The two backends need a long-lived host with a persistent volume (Docker/VPS). `render.yaml` is a bridge setup on a free tier with ephemeral storage, for testing only.
