# Deploying 1btc

Three moving parts:

| Part | Where it goes | Why |
|---|---|---|
| **web client** (`packages/web`) | **Vercel** (static SPA) | no server state |
| **index service** (`packages/server`) | a **VPS** you control | long-lived WebSocket + SQLite |
| **clubs relay** (`packages/relay`) | the same VPS | long-lived WebSocket + SQLite + relay identity key |

The index and relay **cannot** run on Vercel / serverless — they hold open
sockets, write to a local database, and (the relay) keep a signing key on disk.

---

## 1. Backend — VPS (Nigeria-based, your control)

Any small box with Docker. 1–2 GB RAM is plenty to start.

```bash
git clone https://github.com/Hussman256/1btc.git
cd 1btc
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
index.1btc.xyz  { reverse_proxy localhost:8787 }
clubs.1btc.xyz  { reverse_proxy localhost:8788 }
```

Both endpoints must speak `wss://` and the relay also serves its NIP-11 doc on
plain `GET /` — Caddy handles both.

### Config (optional)

Copy `packages/server/.env.example` / `packages/relay/.env.example` to `.env`
files, or set the vars in `docker-compose.yml`. Notable:
`RELAYS` (firehose sources), `RETENTION_DAYS`, `RELAY_NAME`.

---

## 2. Web client — Vercel

The repo root `vercel.json` already points Vercel at the workspace:

```
Framework:         Vite (auto)
Install Command:   npm install
Build Command:     npm run build --workspace @1btc/web
Output Directory:  packages/web/dist
```

Import the GitHub repo in Vercel, leave the Root Directory at the repo root, and
set two environment variables:

```
VITE_INDEX_URL   = wss://index.1btc.xyz
VITE_CLUBS_RELAY = wss://clubs.1btc.xyz
```

Redeploy. The client works without either service (falls back to public relays);
they just make Discover ranking, Notifications, Search and Clubs possible.

### CLI

```bash
npm i -g vercel
vercel link          # once
vercel --prod
```

---

## 3. Checklist

- [ ] `docker compose up -d` on the VPS, both `/health` endpoints green
- [ ] Caddy/nginx terminating TLS for `wss://index…` and `wss://clubs…`
- [ ] `relay-data` volume backed up somewhere
- [ ] Vercel project imported, `VITE_INDEX_URL` + `VITE_CLUBS_RELAY` set, deployed
- [ ] Open the deployed app → sidebar shows `index` and `clubs` dots green
