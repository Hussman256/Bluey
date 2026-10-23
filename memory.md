# memory.md: Bluey project log

A running record of where the project stands, what was decided, and what happened at each checkpoint.
**Update this file at every checkpoint** (finished feature, decision, deploy, or end of session). Newest checkpoint goes at the top of the log.

---

## Current status

### Built
- **Phase 1, Nostr client:** login (NIP-07 / bunker / keygen), Following + Discover feeds, threads, profiles with follow + zap, NIP-23 Reads, Blossom media upload, NWC wallet (non-custodial).
- **Phase 2, index service** (`packages/server`): firehose → SQLite, web-of-trust (PageRank) ranked Discover, Notifications, Search. The client falls back to relays when it is offline.
- **Phase 3, Clubs** (`packages/relay`): NIP-29 relay with relay-enforced membership, free/open join, admin add/remove/edit.
- **Phase 4, Learning:** bootcamps (30004 of 30023 lessons), cohort club per bootcamp, live classes (NIP-53), completion badges (NIP-58).
- **Phase 5, Reputation + feeds:** Ships + NIP-32 attestations, feed picker (Following / Discover / Ships / Latest + any NIP-90 DVM).
- **Phase 6, PWA + deploy:** installable PWA, Vercel config (client), Dockerfiles + compose (backends), `DEPLOY.md`.
- **Since the phases:**
  - Highlights (NIP-84) on **lessons**.
  - Vouched card replaced the Builder score.
  - Profile tabs: Notes / Replies / Badges / Ships (Ships shows only when the person has posted any).
  - Zap button on the profile header.
  - Feed cleanup: spam / link-farm filter, bot-dump filter, NIP-36 blur, mute words (NIP-51), reports (NIP-56), language filter.
  - Profile editing.
  - Basic "Trending" in the right rail (just the top 5 Discover posts).

### Not built yet
- [ ] Auto-translate posts
- [ ] Real time-windowed "Trending now" (current panel is not time-windowed)
- [ ] Highlights on Reads articles (lessons only today)
- [ ] Granular notification controls
- [ ] Clubs tab on profiles
- [ ] Private clubs / read gating (stub in `packages/relay/src/relay.ts` `handleReq`)
- [ ] Paid clubs: intentionally out of scope for v1

### Production / housekeeping
- [x] **Untrack `packages/relay/data/relay.key`:** Added `packages/relay/data/` and `*.key` to `.gitignore` and removed from git cache (`git rm --cached`). (Consider rotating before launch if needed).
- [ ] Backends are on Render free tier: no persistent disk (SQLite resets on restart), services sleep. Move to a VPS with a volume before real users.
- [ ] No test suite: `npm run check` (typecheck + lint) is the only automated check.
- [ ] README "Planned" section is stale (lists highlights / Vouched / mute words as planned).
- [ ] Later: SQLite → Postgres when one node isn't enough.

### Suggested next order
1. Persistent backend hosting (Render free tier ephemeral DB resolution)
2. Time-windowed Trending
3. Auto-translate

---

## Decisions (keep these unless explicitly changed)
- Positioning: social + learning app. **Not** a "get paid in sats" job board. Global, geography-neutral product; the team is Nigeria-based.
- Wallet: non-custodial only (NWC or manual invoice). No custody, no on/off-ramp.
- Clubs are free and open in v1. No zap-gating, nothing paywalled.
- Reputation is shown as facts (Vouched), never as a single score.
- The client must always work with neither backend running (relay fallback).

---

## Checkpoint log

### 2026-10-23: renamed to Bluey (fully)
- GitHub repo renamed to `Hussman256/Bluey`. The display name is now **Bluey** everywhere (UI, page title, PWA manifest, NIP-89 client name, relay NIP-11 name, docs). Lowercase `bluey` only where it has to be lowercase: npm packages (`bluey`, `@bluey/*`), the `t` tag client marker, and identifiers.
- All remaining old identifiers renamed: Nostr `t` tags are now `bluey:bootcamp`, `bluey:lesson`, `bluey:live`, `bluey:ship`; the label namespace is `bluey.ship`; localStorage keys are `bluey:*`; the DEPLOY.md domains are `index.bluey.xyz` and `clubs.bluey.xyz`; the Render services are `bluey-index` and `bluey-relay`.
- Consequences: bootcamps, lessons, live classes and Ships published under the old `1btc:*` tags no longer show up. Saved settings (wallet NWC link, relays, mutes, language filter) reset once per browser. A Render Blueprint sync creates new services with new `onrender.com` URLs, so the Vercel `VITE_*` env vars must be updated.
- Older log entries below still use the old names, because they describe what happened at the time. Old commit messages also still say 1btc. The local folder is still `1btc`.
- Nothing committed yet. `npm run check` passes.

### 2026-10-21: repo renamed to satcraft, commit authorship fixed
- GitHub repo renamed to `Hussman256/satcraft`, and the app name changed from satscraft to satcraft to match (`@satcraft/*` packages). `origin` and the repo links in DEPLOY.md and the relay config were updated.
- Every past commit used `fiayobiseidu005@gmail.com`, which GitHub credits to the Fiayobi account. All 30 commits were rewritten to `Hussman256 <hussainsulaiman256@gmail.com>` and force-pushed (new head `1f8b478`). The files in every commit are unchanged. The old history is kept locally in the `backup/pre-author-rewrite` branch.
- This repo now sets its own git `user.name`/`user.email`, so new commits are credited to Hussman256.
- `packages/relay/data/relay.key` is untracked again, but it is still in the public history. Rotate it before launch (rotating orphans existing clubs).

### 2026-10-20: renamed project (1btc → satscraft, later satcraft)
- Branding, UI copy, docs, PWA manifest, NIP-89 client name, relay NIP-11 name and package scope (`@1btc/*` → `@satcraft/*`) all now say satcraft. Lockfile regenerated, `npm run check` passes.
- Kept on purpose (renaming would break existing data or deploys): Nostr `t` tags (`1btc:bootcamp`, `1btc:lesson`, `1btc:live`, `1btc:ship`), the `1btc.ship` label namespace, localStorage keys (`1btc:*`), the `1btc.xyz` domains in DEPLOY.md, and the Render service names.
- Not done: the local folder is still named `1btc`.

### 2026-10-12: untracked relay secret key
- Added `packages/relay/data/` and `*.key` to [.gitignore](file:///C:/Users/pc/1btc/.gitignore).
- Ran `git rm --cached packages/relay/data/relay.key` so the secret key file is no longer tracked in git while preserved locally.
- Note: If this key has ever been pushed to a remote public repo, consider generating/rotating the key before launch (though rotating will orphan any existing test clubs).

### 2026-10-04: competitor teardown, Zero Club (zeroclubs.xyz)
- Explored the logged-in app (user's account, nothing posted, joined, or bought).
- What it is: a centralized "learn → prove → earn" platform, Naira-denominated (₦), Nigeria-focused. No Nostr, Bitcoin, or Lightning.
- Sections: Home feed (Discover / Following / Live / Leaderboard / Institution), Learn (paid bootcamps ₦25k–150k), Clubs (plan-limited), Messages, Tasks, custodial Wallet (add money / withdraw / request / gifts), Opportunities (gigs), Zero Store (digital products), ZeroHub (versioned project "ships"), ZeroNotes (long-form), Games (tournaments with ₦ prizes), Zero AI ("in development"), Bookmarks, My Store, Metrics, Premium ₦3,000/mo.
- Ideas worth borrowing for Bluey (not decided yet): versioned ships with collaborators + release notes; a bootcamp "what you get" + syllabus overview on bootcamp pages; Institutions as a discovery surface; Live rooms tab in the feed; a proof-centric profile line ("N ships · N verified").
- Conflicts with Bluey decisions: custodial wallet, paid bootcamps/clubs, gig marketplace, XP/points gamification, paywalled Premium.

### 2026-10-04: project audit + docs
- Created `CLAUDE.md` (commands, architecture, cross-package patterns).
- Audited built vs. not built against the code (results in "Current status" above).
- Found `relay.key` committed to git; not fixed yet.
- Created this `memory.md`.
- **Next:** waiting on the user's choice of what to work on first.
