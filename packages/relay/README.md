# @1btc/relay — clubs relay (NIP-29)

A minimal NIP-29 relay for 1btc's Clubs. Relay-enforced membership: only members
can post to a group, only admins can moderate. Groups are **free and open** in
v1 — a join request auto-approves. No zap-gating.

## Run

```bash
npm run dev:relay        # from repo root — ws + NIP-11 on :8788
```

Node 24+, `node:sqlite`, `tsx`. No native modules, no build step.
Relay identity key is generated on first run at `data/relay.key` (gitignored);
it signs the relay-generated `39000`/`39001`/`39002` events.

## Supported

| kind | who | effect |
|---|---|---|
| `9007` create | anyone | new group, sender becomes owner |
| `9002` edit-metadata | admin | name / about / picture |
| `9000` add-user / `9001` remove-user | admin | membership + roles |
| `9021` join | anyone | auto-approved for open groups |
| `9022` leave | self | removes membership |
| `9` chat, `11` thread, `1111` reply | members | posted to the group |
| `9005` delete-event, `9008` delete-group | admin | moderation |

Relay-generated (clients cannot forge these): `39000` metadata, `39001` admins,
`39002` members — rebuilt and rebroadcast on every membership/metadata change.

Wire protocol: standard Nostr relay (`EVENT` / `REQ` / `CLOSE` / `EOSE` / `OK` /
`CLOSED` / `NOTICE`) plus NIP-42 `AUTH`. NIP-11 document on
`GET /` with `Accept: application/nostr+json`.

## Production notes

- Swap `node:sqlite` for Postgres in `db.ts` / `store.ts` when one node isn't enough.
- Put it behind TLS; point the client at `wss://…` via `VITE_CLUBS_RELAY`.
- Private groups + read gating are stubbed in `relay.ts` `handleReq` for a later phase.
