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
0. **Blocker:** persistent hosting for the index (key backups + names now live there)
1. Persistent backend hosting (Render free tier ephemeral DB resolution)
2. ~~Direct messages~~ (built and committed 2026-11-12, 6705326)
3. Test the remaining publishing flows (Ships, vouches, bootcamps, quizzes, clubs) using `VITE_RELAYS`
4. Try passkeys on a real device

---

## Decisions (keep these unless explicitly changed)
- Positioning: social + learning app. **Not** a "get paid in sats" job board. Global, geography-neutral product; the team is Nigeria-based.
- Wallet: non-custodial only (NWC or manual invoice). No custody, no on/off-ramp.
- Clubs are free and open in v1. No zap-gating, nothing paywalled.
- Reputation is shown as facts (Vouched), never as a single score.
- The client must always work with neither backend running (relay fallback).
- (2026-10-30) Zero Club is no longer a reference. Bluey took the mechanics it needed; from here every feature is Bluey's own, aimed at being best in class at launch.

---

## Checkpoint log

### 2026-11-12: Trending and auto-translate checked and fixed (ready to merge)
- **Trending fixes:** age now counts relative to the window (`ageH * 24 / hours` in `queries.ts`), so 7d ranks the week's biggest posts instead of the newest ones (24h ranks exactly as before). Only kind 1 is a candidate: reposts carry the original post's JSON as content and would have shown up as raw JSON. The silent Discover fallback is gone, and an empty window says "Nothing trending in the last … yet." There's a 12h button now. Previews strip `nostr:` references as well as links.
- **Translate fixes:** links and `nostr:` references are swapped for `[n]` placeholders before translating (on-device or Google), so they never leave the device and can't be altered. If a placeholder comes back damaged, the plain text is sent instead. "Translate post" is hidden when the on-device detector is confident the post is already in your language. Auto-translate failures are silent (no red error on the feed). Posts over 4,000 characters stay out of the localStorage cache.
- **Tested** on port 5174 with a throwaway relay and a throwaway index (its own DB in the scratchpad), seeded with made-up posts from test keys through the index's own `ingest()`. Trending windows: 4h leaves out a 10-hour-old post and 12h includes it; 7d puts the 3-day-old big post first; a repost with 30 fast reactions never appears; switching windows in the panel matches the server. Translate, in Chrome with the on-device detector: English posts show no button; the French post translated through Google (the fr→en on-device model wasn't downloaded), with the mention still a profile link and the link intact. Google received only `…Merci à [0] … notes : [1]`. Auto-translate sent only the French post. With Google blocked, a new Spanish post stayed as written with no error. `npm run check` is clean.
- **Not tested:** the on-device Translator actually translating (its model wasn't downloaded), the empty-window message, and Trending on real data. The unofficial Google endpoint is still used.
- **Learned:** the index backfills only the last 6 hours at startup, then follows live. On a host that wipes the DB (Render free tier), 12h/24h/7d really cover about 6 hours after each restart. The persistent volume fixes this.

### 2026-11-12: direct messages (NIP-17)
- **Built:** `/messages` (Chats + Requests) and `/messages/:npub` (comma-separated npubs for groups), a Message button on profiles, a rail item, and a Feed-header icon on phones. Logic is in `nostr/dms.ts`, pages in `routes/MessagesPage.tsx`. New kind `DMRelays: 10050` in shared.
- **How it works:** kind 14 rumors, sealed and gift-wrapped by NDK's `giftWrap`/`giftUnwrap`, which verify that the seal's signer matches the sender. Each message is wrapped for every recipient plus a copy for yourself. It's sent to the recipient's 10050 inbox relays, or else their NIP-65 read relays plus ours. A 10050 list (first 3 public relays) is published once at sign-in, only if the person has none (`syncDmRelays`, run beside `syncRelayList`). With `VITE_RELAYS` set, everything stays on the test relays.
- Requests are conversations with nobody you follow and no reply from you; replying moves them to Chats, and they can be muted. Muted people are hidden. Read markers are timestamps in localStorage (`LS.dmRead`); message text is never stored. Decrypted messages live in memory for the session, and unwrapping runs one at a time because extensions may prompt for each.
- NDK's `giftWrap` doesn't actually check whether the signer supports NIP-44 (it skips awaiting an async result), so `useCanMessage` checks it and the pages explain when it's missing.
- **Tested end to end** with the throwaway account on port 5174, `VITE_RELAYS` pointed at an in-memory relay, and a second account driven by nostr-tools' own NIP-17 code. Verified: the 10050 list was published at sign-in; B→A arrived under Requests with the right name and text; A's reply was read by nostr-tools; the request moved to Chats; after a reload the conversation rebuilt from the relay, including A's own copy; B couldn't open wraps addressed to A; with the relay down a send showed "Not sent. Retry" and Retry delivered once it was back; the profile Message button opened the conversation; at 390px wide, nothing scrolled sideways and the composer sat above the dock. `npm run check` is clean.
- **Not built / not tested:** no unread badge in the nav (the inbox starts only when Messages opens, to avoid signer prompts on every launch); no persistent cache, so each session decrypts again, which is slow with bunkers and extensions; kind 15 file messages are ignored; groups can be received and replied to but not started; not tested with a NIP-07 extension, a bunker, or real public relays.

### 2026-11-12: five social basics committed
- The 2026-11-02 work (older posts, delete, @mentions, followers, relay list, `VITE_RELAYS`) is committed on `feat/mobile-rebuild`. `npm run check` was clean and the changed files were scanned for secrets first. Not pushed or merged yet.

### 2026-11-02: five social basics (older posts, delete, @mentions, followers, relay list)
- **Older posts:** Following, Discover and Latest load more as you scroll (`useOlderNotes`, `LoadMore`). They use the index when it answers and relays when it doesn't, and Following continues on relays once the index's history runs out.
- **Delete:** NIP-09 from the post menu, with a confirmation that says some relays may keep a copy; "Undo" on your own reposts (`nostr/deletions.ts`). The client hides what you deleted and honours deletions from a post's own author. The index now ingests kind 5 and keeps tombstones in a `deletions` table, so a copy from another relay can't bring a post back. Anyone else's deletion is ignored.
- **@mentions:** suggestions in the Composer (`useMentionSearch`, new index method `people`). People you follow come from relays, so it works with the index offline. Publishes `nostr:npub…` plus a `p` tag. Only the main Composer has this; club chat and the Ship composer don't.
- **Followers:** counts link to `/p/:npub/following` and `/followers` (`FollowListPage`, new index method `followers`), with Follow buttons. Followers need the index; the count is hidden and the list explains when it's offline. The count is only what the index has seen, and the page says so.
- **Relay list:** NIP-65 kind 10002 published once, a few seconds after sign-in, only if the person has none (`nostr/relayList.ts`). Settings keeps it in step. An existing list is never overwritten at sign-in.
- `collectEvents` replaces `fetchEvents` in new code: it doesn't wait on every relay and keeps partial results. `useDvmFeed.ts` still uses `fetchEvents`.
- **New dev option:** `VITE_RELAYS` replaces all public relays and turns off NDK's outbox model, so test accounts can post safely.
- **Tested end to end in the real app** with a throwaway account on a private relay that ignores deletions, a throwaway index and clubs relay. Separately, this was also the first real run of recovery-key sign-up, onboarding, posting and following. Verified: mention picked by keyboard and published correctly; 200 posts paged with no gaps or duplicates on Latest and Following; delete survives wiping local memory and reload; forged deletion ignored; follower counts and lists; follow from the list; and with the index stopped, Following, mentions and the offline followers message. `npm run check` is clean.
- **Not tested:** Discover paging (too little trust data in the test world), Undo repost, adding or removing a relay in Settings, phone-width layout of the new screens, and anything against real public relays.
- Noticed, not changed: "Translate post" shows on posts already in your language.
- ⚠ With one relay answering and one down, NDK never reports end-of-results, so an empty page shows "Try again" after 8 seconds. Several healthy relays avoid this.

### 2026-11-02: first browser walkthrough, Trending and auto-translate fixes
- **Walked through, phone width, read-only:** Feed, Learn, Clubs, board, profile (You), `/ship/new`, `/teach`, `/ships`, Alerts, Settings, and `/@name` for an unknown name. All render with sensible empty states and no sideways overflow. Trending and the status dots were also seen working at desktop width. Checked by reading page text and the console through Vite's log, not visually: screenshots froze from low memory after the first desktop one.
- **Fixed:**
  - Trending rows nested a profile link inside a post link (invalid HTML, React error on every load).
  - Trending picked candidates from the newest 500 posts, which shrank 24h and 7d. It now picks by trust, then engagement, across the whole window. In a test with 2,000 newer posts in the way, the old query missed a big 3-day-old post on 7d and the new one ranks it first, at the same speed.
  - Auto-translate only sends posts that look foreign (on-device detector, else script). Latin-script text with no detector stays on the device; the manual button still works. On-device translation now gets `sourceLanguage`. Long posts split into pieces, requests run one at a time, and Settings says text may go to Google. Tested against the real endpoint from Node, including a 14,000-character post. The auto-translate UI and the browser's built-in translator were **not** exercised.
- **Not tried yet, because they publish or need a person:** onboarding, passkey prompts, posting, Ship publishing, vouching, enrolling, quizzes, clubs chat, live classes, zaps. These need a test account on a relay set that excludes public relays.
- Known leftovers: Settings says the manual zap flow "lands in a later build"; Trending quietly shows Discover posts when a window is empty; there's still no 12h button; the unofficial Google endpoint remains.
- These changes are uncommitted on `feat/mobile-rebuild`.

### 2026-11-02: all work committed to a branch
- Everything since the rename is in one commit, `f3bcedd`, on `feat/mobile-rebuild`, pushed to origin. It isn't merged to `main`. The changed files were scanned for secrets first and none were found.
- That commit includes time-windowed Trending and auto-translate, which were previously held back on purpose (see 2026-10-23). They should be checked before merging.

### 2026-11-02: link previews for /@name
- `api/og.ts` (Vercel edge function, repo root) returns a small HTML page with Open Graph and Twitter tags. A `vercel.json` rewrite sends `/@:handle` there only for crawler user agents (WhatsApp, X, Facebook/iMessage, Telegram, Slack, Discord, LinkedIn and others); people still get the SPA. It's typechecked through `packages/web/tsconfig.node.json`.
- New index endpoint `GET /v1/card?handle=` (`server/src/accounts.ts`) returns name, bio and photo for a Bluey name, `name@NAME_DOMAIN`, npub or hex. `INDEX_HTTP_URL` overrides the default index address for the function.
- Decided: **no Ship or vouch counts in previews.** The index prunes events after `RETENTION_DAYS` (21), so counts would undercount long-active people. Addresses on other domains aren't looked up, so a stranger's URL can't make us fetch hosts they pick; those links get the generic preview.
- Any failure (index down, unknown handle, non-https photo) falls back to a generic Bluey preview or the Bluey icon.
- Verified on a throwaway index: all handle forms, unknown handles, HTML escaping of a hostile name, long-bio clipping, http photo rejected, index offline. The rewrite was compiled with `@vercel/routing-utils` and matched against sample paths and user agents. `npm run check` is clean. **Not yet tried:** a real Vercel deploy and a real WhatsApp/X/Telegram share. Previews stay generic until the index is on a real host.

### 2026-10-31: #3 public proof-of-work page (/@name)
- `/@name` (`routes/PublicProfilePage.tsx`) is open to everyone, signed in or not. `App.tsx` renders it before the sign-in gate, because React Router can't match "@" plus a param in one segment. Handles resolve in `nostr/handles.ts`: a bare name goes to the index's NIP-05, then falls back to `name@NAME_DOMAIN`; `name@other.domain` goes to any NIP-05; npub and hex are used as-is.
- The page shows: photo, name, verified-tutor check, address, bio, "Send sats" (`lightning:` link to their lud16) and "Share this page" (native share sheet or copy). Then facts (Ships published, vouched by others, vouches received, bootcamps finished), a Ship grid (cover, category, title, write-up, tools, vouch count, outbound links), the bootcamps they teach, badges, and a footer explaining every item is a signed Nostr event, with their npub linked to njump.me.
- Your own profile has a "Your public page" card (`PublicPageLink.tsx`). It uses `/@name` when your NIP-05 is on NAME_DOMAIN, else `/@npub…` with a nudge to claim a name.
- `npm run check` is clean. Not tried in a browser yet: the dev servers were stopped by the low-memory reaper.
- Next for this page: link previews. WhatsApp, X and Telegram read Open Graph tags, which an SPA can't set per page; that needs a small Vercel edge function rendering `og:title` / `og:image` for `/@name`.

### 2026-10-30: #2 lessons that prove you learned (quizzes, auto badges, AI study helper)
- **Quizzes** live on the index, not on Nostr, so answers stay secret (`server/src/learning.ts`; tables `quizzes`, `quiz_attempts`, `quiz_awards`). The tutor sets a quiz from their own lesson page (`QuizEditor`): 1–20 questions, 2–5 options, an explanation, and a pass mark of 50–100%, default 70%. Only the lesson's author can save it (NIP-98 pubkey must match the lesson and bootcamp addresses). Learners answer at the end of the lesson (`QuizCard`); the server grades the answers and keeps the best attempt. Attempts are limited to 15 per hour per quiz.
- **Automatic completion badge:** when a learner has passed every quiz in a bootcamp, the index's **examiner key** (`server/src/examiner.ts`; `EXAMINER_SECRET_KEY`, else `data/examiner.key`) publishes a NIP-58 badge definition named "<title> — Completed" (counts in Vouched and on the board) and awards it. A failed publish is retried on the next attempt or progress check. The tutor's manual award still works. The bootcamp page shows "Quizzes passed X of Y" (`QuizProgressLine`).
- **AI study helper: left out for now** at the owner's request (same day). It was built, then fully removed: the lesson panel, `POST /v1/study`, its config and the `@anthropic-ai/sdk` dependency. The design, if it comes back: a server-side Claude call (Opus 5.5, low effort, lesson text prompt-cached, refusal fallback), NIP-98 signed, a daily quota per learner, and the panel hidden unless the index enables it.
- Shared HTTP helpers (`send`, `readBody`, `nip98`) moved to `server/src/http.ts`.
- Verified on a throwaway index (its own database, relay set to the local clubs relay so no test badges hit public relays): only the author can set a quiz, invalid questions are rejected, the public quiz has no answers, a worse retry keeps a pass, completion is detected once every quiz is passed, the award is attempted, and the helper answers 503 when off. `npm run check` is clean. **Not yet tried:** a real Claude call (needs an API key and costs money) and a real badge publish to public relays.
- ⚠ Quizzes, attempts and awards also live in the index's SQLite, so the persistent-hosting blocker grows. Set `EXAMINER_SECRET_KEY` in production, or each restart creates a new badge issuer.

### 2026-10-30: one-minute start (passkeys, onboarding, @name + Lightning address)
- **Passkeys** (`web/src/nostr/passkey.ts`): "Create your account" makes a passkey and a fresh Nostr key, then encrypts the key with AES-GCM using a key derived from the passkey's WebAuthn PRF secret. The encrypted blob is kept in `LS.passkeys` and backed up to the index (`POST /v1/keys`, NIP-98 signed). "Sign in with a passkey" asks for any Bluey passkey, finds its blob (locally, else `GET /v1/keys/:credId`), and decrypts it. Devices without PRF fall back to the recovery-key flow with a notice. Extension, bunker and nsec sign-in moved under "More ways to sign in". Once signed in, NDK's session still keeps the key in localStorage, as before.
- **Onboarding** (`web/src/session/Onboarding.tsx`) runs once for a just-created account (`LS.onboarding` = its pubkey): name, photo and bio → interests → follow suggestions (new index method `suggest`: top-WoT profiles whose bio matches the topics) → clubs to join → claim a name → backup status, plus an optional recovery key.
- **Names** (`server/src/accounts.ts`, tables `names` and `key_backups` in `db.ts`, SQL in `queries.ts`): `name@NAME_DOMAIN` (default bluey.xyz). The server serves NIP-05 at `/.well-known/nostr.json` and a Lightning address at `/.well-known/lnurlp/:name` that returns the owner's own wallet's LNURL-pay response untouched, so payments and zaps go straight to their wallet. **Non-custodial.** A wallet address is checked when it's saved (it must answer with `payRequest`). Writes are NIP-98 authed. Names can be claimed or changed in Settings (`NameClaim.tsx`).
- `vercel.json` rewrites `/.well-known/nostr.json` and `/.well-known/lnurlp/:name` to `https://index.bluey.xyz`. New env vars: `VITE_NAME_DOMAIN` (web) and `NAME_DOMAIN` (server).
- Verified against the running index: signed backup save and read, overwrite by another key refused (409), unsigned writes refused (401), name claim, taken-name refusal, reserved names, NIP-05 lookup, Lightning forwarding, bad wallet address refused, CORS preflight, `suggest`. `npm run check` is clean. **The passkey prompts themselves haven't been tried yet**: that needs a person at a device with Face ID, a fingerprint or Windows Hello.
- ⚠ Key backups and names live in the index's SQLite. On Render's free tier (ephemeral disk) they are **wiped on restart**, and people would lose cross-device sign-in and their names. Moving to a host with a persistent volume is now a hard blocker for launch.

### 2026-10-30: rebuild batch 2 (Learn, tutors, Clubs, You, weekly board, on-air)
- **Approved tutors:** the curator account is set by `VITE_BLUEY_CURATOR` (npub or hex; see `web/.env.example`). It publishes a NIP-51 follow set (kind 30000, `d=bluey-tutors`, `TUTOR_LIST_D`). `nostr/tutors.ts` has `useApprovedTutors`, `useTutorAdmin` (the curator gets an "Approve as verified tutor" button on any profile) and `useApplyToTeach`, which sends the application as a NIP-17 gift-wrapped DM to the curator. **With no curator set, Learn lists every bootcamp and nobody shows as verified.** The curator account doesn't exist yet: create it, then set the env var on Vercel.
- **/teach:** approved tutors (or everyone, with no curator set) get the create-bootcamp form, now with topics. Everyone else gets the application form. The Make sheet and Learn link here.
- **Bootcamp topics:** `t` tags from `BOOTCAMP_TOPICS` (shared), shown as filter chips on Learn.
- **Learn:** a dark Continue card per enrolled bootcamp (cohort club membership), with a progress ring, next lesson, cohort-club link and next or live class. Below it, topic chips and the verified catalogue, with learner counts from cohort rosters.
- **Lesson progress** is stored on the device only (`nostr/progress.ts`, `LS.lessonsRead`). A lesson counts once it's opened. It's private by design; completion badges stay the public signal.
- **Clubs:** search, a "Yours" list (cohort tag, "Live now" when a cohort's bootcamp has a live class), and "Worth joining" sorted by people you follow, then members, with one-tap Join. `useClubRosters` (all 39001/39002 lists) and `useMyClubs` are in `useClubs.ts`.
- **You (own profile):** Learning / Teaching / Hosting switch (`ModePanel`, remembered per device). Vouched is now a facts grid (Ships and how many are vouched, bootcamps finished, people you follow who follow them, or sats received). Verified-tutor check next to the name, wallet chip, and Ships first in the tabs.
- **/board, "Who showed up this week":** `nostr/board.ts` ranks builders (Ships, vouches received and given, completion badges), tutors (learners finished, live classes) and clubs (active members, Ships shared, messages), from public events since Monday. Filtered by WoT when available. Linked from a card on Following and Ships.
- **Home:** an on-air strip of live classes (your cohorts first), hidden when nothing is live (`OnAir.tsx`, `useLiveNow`).
- `npm run check` is clean. Not yet tried by hand in the browser.
- Not built yet: live rooms inside ordinary clubs (live is still per bootcamp), unread counts on clubs, a tutor applications inbox in-app (the curator reads them in any NIP-17 client such as 0xchat or Amethyst).

### 2026-10-30: rebuild batch 1 (Ships extended, new theme, new app shell)
- **Ships extended.** Still a kind 1 with `t bluey:ship`, plus new tags: `title`, a self-applied NIP-32 category label (`L/l bluey.ship.category`, values in `SHIP_CATEGORIES` in `shared/kinds.ts`), `tool`, `image` (cover, uploaded to Blossom), `r` links, and `p <pk> "" collaborator`. The content repeats title, cover and links so other Nostr clients show a readable post; `parseShip` strips them back off. Older Ships still parse.
- **Club-only Ships** carry an `h` tag and go to the clubs relay only. The relay now accepts kind 1 from members (`relay.ts` GROUP_KINDS, `groups.ts` MEMBER_WRITE), and club chat (`useClubChat`) shows them as Ship cards.
- A collaborator's profile Ships tab also lists Ships that credit them (`useShipFeed` with a pubkey).
- New 3-step composer at `/ship/new` (`ShipNewPage.tsx`) with the draft autosaved to localStorage (`LS.shipDraft`). `NoteCard` renders any Ship with `ShipBody` (title, cover, tools, links, credits, vouches), so Ships look the same everywhere. `ShipsPage` now uses it too.
- **Theme:** `index.css` tokens switched to cobalt/ink/mist. A new `brand` token is the action colour; `zap` (orange) is now used only for sats (ZapButton, wallet, zap alerts, Lightning addresses). The fonts are now IBM Plex Sans/Mono plus Bricolage Grotesque. New logo (`Mark`, `public/favicon.svg`, `logo.svg`, regenerated PWA icons).
- **Shell:** the phone dock has Feed / Learn / Clubs / You plus a "+" button that opens `MakeSheet` (Post, Ship, Club, Go live, Create a bootcamp). On phones, search and alerts moved into the Feed header and the inline composer is hidden. The desktop rail is restyled and has a "+" button too.
- `npm run check` passes. Not yet tried in the running app.
- Next batch: Learn (Continue card, topic filters, approved-tutor list + "Become a tutor"), Clubs list redesign, the You profile (modes + Vouched facts), the weekly builders board, and the on-air strip on Home.

### 2026-10-30: direction reset to a mobile app on Zero Club's mechanics, plus a design prototype
- The original idea, confirmed by the owner: a Bitcoin mobile social app that uses Zero Club's (zeroclubs.xyz) mechanics and core idea (learn in bootcamps, prove your work with Ships, clubs and live rooms, reputation, a weekly builders board, Learner/Tutor/Creator modes). Bluey must not resemble Zero Club at all: its own layout, colours and logo.
- Decided: **mobile-first PWA** (redesign the current web client; Capacitor wrap later). **Free now, paid later**: a price field exists in the design but stays off for v1. **Tutors:** only approved tutors (a NIP-51 list published by a Bluey account) appear in the Learn catalogue, through a "Become a tutor" application; a "Community" tab with a trust threshold may come later.
- Design prototype (8 artboards: Home, Learn, Clubs, You, Make sheet, Ship composer, weekly board, Brand) is at https://claude.ai/artifact/GExZADsqTQfXDnoBYbsUqQ. Look: cool white (#F3F6FA), cobalt (#1F4FE0), ink (#0D1726), orange only for sats. Logo: a speech bubble with a lightning bolt cut through it. Type: Bricolage Grotesque, IBM Plex Sans, IBM Plex Mono. Navigation: a bottom dock (Feed, Learn, Clubs, You) plus a "Make" button, with alerts in the header.
- Not yet reviewed by the owner. Time-windowed Trending and auto-translate are still uncommitted, as before.

### 2026-10-23: tried Trending + auto-translate in the running app
- Trending: works in the browser. The panel shows with 4h / 24h / 7d (the 12h option exists in the code but has no button), switching windows re-ranks the list, and the panel hides when the index is offline. Bug to fix before shipping: the server only scores the newest 500 posts in the window (`ORDER BY created_at DESC LIMIT 500` in `queries.ts`), so on a busy index 24h and 7d really cover only the last few hours.
- Auto-translate: not tried in the browser, because the machine ran low on memory and the dev servers were stopped. From reading the code: with auto-translate on, every visible note sends a request to Google (including posts already in your language); the built-in browser translator is probably never used because `translate.ts` calls it without `sourceLanguage`; and long posts go in a GET URL that may be too long.

### 2026-10-23: renamed to Bluey (fully)
- GitHub repo renamed to `Hussman256/Bluey`. The display name is now **Bluey** everywhere (UI, page title, PWA manifest, NIP-89 client name, relay NIP-11 name, docs). Lowercase `bluey` only where it has to be lowercase: npm packages (`bluey`, `@bluey/*`), the `t` tag client marker, and identifiers.
- All remaining old identifiers renamed: Nostr `t` tags are now `bluey:bootcamp`, `bluey:lesson`, `bluey:live`, `bluey:ship`; the label namespace is `bluey.ship`; localStorage keys are `bluey:*`; the DEPLOY.md domains are `index.bluey.xyz` and `clubs.bluey.xyz`; the Render services are `bluey-index` and `bluey-relay`.
- Consequences: bootcamps, lessons, live classes and Ships published under the old `1btc:*` tags no longer show up. Saved settings (wallet NWC link, relays, mutes, language filter) reset once per browser. A Render Blueprint sync creates new services with new `onrender.com` URLs, so the Vercel `VITE_*` env vars must be updated.
- Older log entries below still use the old names, because they describe what happened at the time. Old commit messages also still say 1btc. The local folder is still `1btc`.
- Pushed as `595e36d` (stop tracking relay key) and `227157b` (rename to Bluey); `npm run check` passes. Still uncommitted on purpose: time-windowed Trending and auto-translate (`translate.ts` + NoteCard/RightRail/ThreadPage/SettingsPage/queries/api/useIndex). They typecheck but have not been tried in the running app, and translate uses the unofficial `translate.googleapis.com` endpoint.
- The GitHub CLI active account on this machine is `Anambraboi-1`, which cannot push to the repo. The push used the Hussman256 token (`gh auth switch --user Hussman256` to fix it for good).

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
