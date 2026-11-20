# Blusat

**Learn Bitcoin with a cohort, prove what you built, and get paid in sats, on Nostr and Lightning.**

Blusat is a Bitcoin social and learning app. Bootcamps teach in short lessons with quizzes, every bootcamp comes with its own cohort club, and what you build afterwards becomes a public Ship that peers can vouch for. Your account is a Nostr key you own, sats go straight to a wallet you control, and Blusat never holds anyone's money.

| | |
|---|---|
| Web app | **[blusat.vercel.app](https://blusat.vercel.app)** |
| Android app | **[Blusat.apk, release v0.1.0](https://github.com/Hussman256/Bluey/releases/tag/v0.1.0)** |
| Built for | Dakar Bitcoin Hack 2026 (BTrust) |

**What to try:** create an account (no email or phone needed), pick your interests, follow a few people, open Learn and take a bootcamp and its quizzes, join a club, then post a Ship.

*Blusat was called Bluey until November 2026. Package names, storage keys and service names still say `bluey` on purpose, because renaming them would log people out and orphan published content.*

## Features

- **Bootcamps:** short courses written as lessons with quizzes. Finishing one awards a badge anyone can verify.
- **Cohort clubs:** every bootcamp creates a free group chat for its learners. Tutors can run live classes with a stream and live chat.
- **Ships and vouches:** a Ship is a post with a demo or repo link; peers who checked it vouch for it.
- **Vouched, not scored:** profiles show public facts (Ships vouched, bootcamps finished, sats received, people you follow who follow them) instead of a rating.
- **Zaps:** Lightning tips straight to the person's own wallet.
- **Social:** Following, Discover (ranked by web of trust) and Ships feeds, threads, direct messages, clubs, notifications and search.
- **Safety:** spam filtering on the server and the client, mute words, reports, sensitive-media blur, and a language filter.

## How it's built

Everything a user creates is a standard Nostr event, so it works in other Nostr apps and outlives Blusat.

| Feature | Built on |
|---|---|
| Accounts | Nostr keys; passkeys on the web (WebAuthn PRF encrypts the key) |
| Bootcamps and lessons | NIP-51 sets of NIP-23 long-form articles |
| Cohort clubs | NIP-29 groups on our own clubs relay |
| Live classes | NIP-53 |
| Badges | NIP-58 |
| Ships and vouches | Notes with a `bluey:ship` tag, attested with NIP-32 labels |
| Zaps and wallet | NIP-57 zaps, NIP-47 Nostr Wallet Connect |
| Direct messages | NIP-17 |
| Photos | Blossom media servers |

**Stack:** TypeScript throughout. React 19, Vite, Tailwind CSS v4 and NDK on the client; the Android app wraps the same code with Capacitor. The index service and clubs relay run on Node with SQLite.

### Monorepo

| Package | What |
|---|---|
| `packages/web` | The client (web and Android) |
| `packages/server` | The index service: reads the public Nostr network into SQLite and serves a web-of-trust ranked Discover feed, search, notifications and follow suggestions over one WebSocket |
| `packages/relay` | The clubs relay: a minimal NIP-29 group relay with relay-enforced membership |
| `packages/shared` | Event kinds, the index wire protocol and spam rules |

The app works with neither backend running: it falls back to reading public relays directly.

## Run it locally

Needs Node 24+.

```bash
npm install

npm run dev            # client, http://localhost:5173 (works on public relays alone)
npm run dev:server     # index service, :8787 (Discover ranking, notifications, search)
npm run dev:relay      # clubs relay, :8788 (Clubs)

npm run check          # typecheck all packages + lint
```

Deployment (Vercel for the client, Docker hosts for the two services, GitHub Actions for the APK) is described in **[DEPLOY.md](./DEPLOY.md)**.

## Wallet stance

Blusat holds no funds. Users connect a wallet they control over Nostr Wallet Connect (Zeus, Alby Hub and others), or pay zap invoices in any wallet. There is no balance, no on-ramp and no withdrawal to freeze.

## What's next

1. Our own domain (`blusat.xyz`), so every user gets a working `name@blusat.xyz` address for Nostr and Lightning.
2. Passkeys in the Android app.
3. More bootcamps with tutors from African Bitcoin communities.
4. Highlights on Reads articles, and finer notification controls.
5. Play Store release and an iOS build.

## Licence

[MIT](./LICENSE)
