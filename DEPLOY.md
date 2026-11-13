# Deploying Bluey

Three moving parts:

| Part | Where it goes | Why |
|---|---|---|
| **web client** (`packages/web`) | **Vercel** (static SPA) | no server state |
| **index service** (`packages/server`) | **Railway** (now), a VPS later | long-lived WebSocket + SQLite |
| **clubs relay** (`packages/relay`) | **Railway** (now), a VPS later | long-lived WebSocket + SQLite + relay identity key |

The index and relay **cannot** run on Vercel / serverless — they hold open
sockets, write to a local database, and (the relay) keep a signing key on disk.

---

## 1. Backend — Railway (current choice)

Two Railway services from this one repo, each with its own volume. Each
service has a config file in the repo (`packages/server/railway.toml`,
`packages/relay/railway.toml`) that sets the Dockerfile and the `/health` check.

### Before you start

- A Railway account on the **Hobby** plan (the trial ends, and services must not sleep).
- The relay key that's on Render now: Render dashboard → `bluey-relay` →
  Environment → `RELAY_SECRET_KEY`. Copy it **straight into Railway** in step 3.
  Never paste it into a chat, an issue, or a commit.

### 1. Create the project

New Project → **Deploy from GitHub repo** → `Hussman256/Bluey`. Railway
creates one service; that becomes the index. Add the second with
**+ Create → GitHub Repo** → the same repo.

Rename them `bluey-index` and `bluey-relay`. In each service's **Settings**:

| Setting | `bluey-index` | `bluey-relay` |
|---|---|---|
| Source → Root Directory | *(empty)* | *(empty)* |
| Source → Branch | the branch you deploy (`main` after the merge) | same |
| Config-as-code → Config file path | `/packages/server/railway.toml` | `/packages/relay/railway.toml` |
| Deploy → Region | an EU region (closest to Nigeria) | the same region |

### 2. Add a volume to each

Right-click the service (or **+ Create → Volume**) → attach to the service →
mount path **`/data`**. That's where the Dockerfiles keep everything:

- index: `/data/index.db` (events, names, key backups) and `/data/examiner.key` (badge signer)
- relay: `/data/relay.db` and `/data/relay.key`

A service with a volume runs one copy at a time, so each deploy has a few
seconds of downtime. The client falls back to public relays meanwhile.

### 3. Variables

**`bluey-index`** → Variables:

```
PORT=8787
RETENTION_DAYS=21
```

Optional: `RELAYS` (firehose sources), `NAME_DOMAIN` (default `bluey.xyz`),
`EXAMINER_SECRET_KEY` (otherwise one is generated into the volume on first start).

**`bluey-relay`** → Variables:

```
PORT=8788
RELAY_NAME=Bluey clubs
RELAY_SECRET_KEY=<paste the key from Render here, in the Railway dashboard only>
```

Keeping the same `RELAY_SECRET_KEY` keeps the relay's identity. A different
key orphans every club's metadata.

### 4. Public URLs

Each service → Settings → Networking → **Generate Domain**, target port
`8787` (index) / `8788` (relay). You get `https://bluey-index-….up.railway.app`;
the client uses the same host with `wss://`.

If you own `bluey.xyz`, add **Custom Domains** instead: `index.bluey.xyz` and
`clubs.bluey.xyz`, with the CNAME records Railway shows, at your DNS provider.
Then `vercel.json` and `api/og.ts` already point at the right place.

If you use the `….up.railway.app` domains, also change in Vercel:
- the two `index.bluey.xyz` rewrites in `vercel.json` (`/.well-known/nostr.json`
  and `/.well-known/lnurlp/:name`) to the index's Railway host, and
- the env var `INDEX_HTTP_URL=https://<index host>` (link previews for `/@name`).

### 5. Check

```bash
curl https://<index host>/health
curl https://<relay host>/health
```

Both should answer OK. Watch the first deploy's **Build Logs** and **Deploy
Logs** in Railway: the index should log `[relays] backfill:… complete`.
On first start the index only backfills the last 6 hours, then follows live,
so 24h/7d Trending fill in over the following days.

Then set the Vercel variables (section 3 below) and redeploy the client.

### 6. Retire Render

Once the Vercel app shows the `index` and `clubs` dots green on Railway,
delete the two Render services (and their external pinger, if any). Keep
`render.yaml` or delete it; it's only a bridge setup.

---

## 2. Backend — VPS (alternative, your control)

Any small box with Docker. 1–2 GB RAM is plenty to start.

```bash
git clone https://github.com/Hussman256/Bluey.git
cd Bluey
docker compose up -d          # builds + runs index (:8787) and relay (:8788)
docker compose logs -f
```

Data lives in named volumes (`index-data`, `relay-data`). **Back up
`relay-data`** — it holds `relay.key`, the relay's identity. Losing it orphans
every group's `39000/39001/39002` metadata.

### TLS

Browsers on an HTTPS page can't open `ws://`. Put a reverse proxy in front:

```
# Caddy — automatic HTTPS
index.bluey.xyz  { reverse_proxy localhost:8787 }
clubs.bluey.xyz  { reverse_proxy localhost:8788 }
```

Both endpoints must speak `wss://` and the relay also serves its NIP-11 doc on
plain `GET /` — Caddy handles both.

### Config (optional)

Copy `packages/server/.env.example` / `packages/relay/.env.example` to `.env`
files, or set the vars in `docker-compose.yml`. Notable:
`RELAYS` (firehose sources), `RETENTION_DAYS`, `RELAY_NAME`.

---

## 3. Web client — Vercel

The repo root `vercel.json` already points Vercel at the workspace:

```
Framework:         Vite (auto)
Install Command:   npm install
Build Command:     npm run build --workspace @bluey/web
Output Directory:  packages/web/dist
```

Import the GitHub repo in Vercel, leave the Root Directory at the repo root, and
set two environment variables:

```
VITE_INDEX_URL   = wss://index.bluey.xyz
VITE_CLUBS_RELAY = wss://clubs.bluey.xyz
```

Redeploy. The client works without either service (falls back to public relays);
they just make Discover ranking, Notifications, Search and Clubs possible.

Link previews for `/@name` come from an edge function (`api/og.ts`) that asks the
index for the person's name, bio and photo. It defaults to
`https://index.bluey.xyz`; set `INDEX_HTTP_URL` if the index lives elsewhere.
Without the index, shared links show a generic Bluey preview.

### CLI

```bash
npm i -g vercel
vercel link          # once
vercel --prod
```

---

## 4. Checklist

- [ ] Railway: both services deployed from the repo, each with a volume at `/data`
- [ ] Railway: `RELAY_SECRET_KEY` copied from Render, both `/health` endpoints green
- [ ] Custom domains (or the Vercel rewrites + `INDEX_HTTP_URL` updated to the Railway hosts)
- [ ] (VPS instead) `docker compose up -d`, TLS in front, `relay-data` backed up
- [ ] Vercel project imported, `VITE_INDEX_URL` + `VITE_CLUBS_RELAY` set, deployed
- [ ] Open the deployed app → sidebar shows `index` and `clubs` dots green
