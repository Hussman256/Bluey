# 1btc

A builder network on **Nostr** + **Lightning**. Learn in public, ship provable work,
get zapped. Concept modelled on Zero Club; execution modelled on Primal.

> **Phase 1** — a fast, standalone Nostr client running entirely on public relays.
> No 1btc-operated infrastructure yet. See `docs` for the architecture brief.

## Stack

| | |
|---|---|
| UI | React 19 + Vite + TypeScript + Tailwind v4 |
| Nostr | `@nostr-dev-kit/ndk` 3.x + `@nostr-dev-kit/react` |
| Wallet | `@nostr-dev-kit/wallet` — **NWC only, 1btc custodies nothing** |
| Routing | react-router 7 |

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build
```

## What works in Phase 1

- **Login** — NIP-07 extension, `nsec` / `bunker://` paste, or generate a new key
- **Feed** — Following + Discover tabs; Discover is filtered by a 2-hop
  web-of-trust closure of your follow graph (empty until you follow people)
- **Compose / reply / repost / react** (kinds 1, 6, 7)
- **Zaps** (NIP-57) via a connected NWC wallet, with quick-amount buttons
- **Threads** — `/e/:id`
- **Profiles** — `/p/:npub`, follow/unfollow, zaps-received count, profile zap
- **Reads** — NIP-23 long-form list
- **Settings** — connect/disconnect NWC wallet, generate receive invoice,
  reveal + back up your key, view relay set

## Layout

```
src/
  nostr/       kinds, relay config, useWebOfTrust
  session/     LoginScreen (NIP-07 / nsec / NIP-46 / keygen)
  wallet/      Wallet interface + NWC-backed WalletProvider
  components/  Layout, NoteCard, Composer, ZapButton, primitives
  routes/      Feed, Thread, Profile, Reads, Settings
```

## Not yet (later phases)

Caching/index service · NIP-29 group relay for paid Clubs · bootcamps &
live classes · badges & builder score · editable relays · Cashu wallet option.
