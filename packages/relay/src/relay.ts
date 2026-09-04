import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { KIND } from '@1btc/shared';
import { verifyEvent, type Event } from 'nostr-tools/pure';
import { matchFilters, type Filter } from 'nostr-tools/filter';
import { WebSocket, WebSocketServer } from 'ws';
import { config } from './config.ts';
import { handleGroupEvent, isRelayGenerated } from './groups.ts';
import { queryFilter, storeEvent } from './store.ts';

const GROUP_KINDS = new Set<number>([
  KIND.GroupChatMessage,
  KIND.GroupChatReply,
  KIND.GroupThread,
  KIND.GroupThreadReply,
  KIND.GroupAddUser,
  KIND.GroupRemoveUser,
  KIND.GroupEditMetadata,
  KIND.GroupDeleteEvent,
  KIND.GroupCreate,
  KIND.GroupDelete,
  KIND.GroupJoinRequest,
  KIND.GroupLeaveRequest,
]);
interface Client {
  ws: WebSocket;
  authed: string | null;
  challenge: string;
  subs: Map<string, Filter[]>;
}

const clients = new Set<Client>();

function send(ws: WebSocket, msg: unknown) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(ev: Event) {
  for (const c of clients) {
    for (const [subId, filters] of c.subs) {
      if (matchFilters(filters, ev)) send(c.ws, ['EVENT', subId, ev]);
    }
  }
}

function verifyAuth(ev: Event, challenge: string): string | null {
  if (ev.kind !== 22242) return null;
  if (Math.abs(Date.now() / 1000 - ev.created_at) > 600) return null;
  if (ev.tags.find((t) => t[0] === 'challenge')?.[1] !== challenge) return null;
  try {
    if (!verifyEvent(ev)) return null;
  } catch {
    return null;
  }
  return ev.pubkey;
}

function handleEvent(client: Client, ev: Event) {
  try {
    if (!verifyEvent(ev)) return send(client.ws, ['OK', ev.id, false, 'invalid: bad signature']);
  } catch {
    return send(client.ws, ['OK', ev.id, false, 'invalid: bad signature']);
  }
  if (ev.created_at > Date.now() / 1000 + 900) {
    return send(client.ws, ['OK', ev.id, false, 'invalid: timestamp too far in the future']);
  }
  if (isRelayGenerated(ev.kind)) {
    return send(client.ws, ['OK', ev.id, false, 'blocked: relay-generated kind']);
  }
  if (!GROUP_KINDS.has(ev.kind)) {
    return send(client.ws, ['OK', ev.id, false, 'blocked: this relay only accepts NIP-29 group events']);
  }

  const res = handleGroupEvent(ev, client.authed);
  if (!res.ok) return send(client.ws, ['OK', ev.id, false, res.msg]);

  if (!res.drop) {
    storeEvent(ev);
    broadcast(ev);
  }
  for (const gen of res.generated ?? []) {
    storeEvent(gen);
    broadcast(gen);
  }
  send(client.ws, ['OK', ev.id, true, res.msg]);
}

function handleReq(client: Client, subId: string, filters: Filter[]) {
  client.subs.set(subId, filters);
  const seen = new Set<string>();
  // v1 groups are all public-readable, so REQ has no membership gate yet.
  // (When private groups land, message history for a private group id will be
  //  withheld here unless client.authed is a member.)
  for (const f of filters) {
    for (const ev of queryFilter(f)) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      send(client.ws, ['EVENT', subId, ev]);
    }
  }
  send(client.ws, ['EOSE', subId]);
}

export function startRelay() {
  const http = createServer((req, res) => {
    if (req.headers.accept?.includes('application/nostr+json')) {
      res.writeHead(200, { 'content-type': 'application/nostr+json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify({ ...config.info, pubkey: undefined }));
      return;
    }
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, clients: clients.size }));
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('1btc clubs relay — connect over websocket\n');
  });

  const wss = new WebSocketServer({ server: http });

  wss.on('connection', (ws) => {
    const client: Client = {
      ws,
      authed: null,
      challenge: randomBytes(16).toString('hex'),
      subs: new Map(),
    };
    clients.add(client);
    send(ws, ['AUTH', client.challenge]);

    ws.on('message', (raw) => {
      let msg: unknown[];
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return send(ws, ['NOTICE', 'invalid json']);
      }
      const [type, ...rest] = msg;
      switch (type) {
        case 'EVENT':
          handleEvent(client, rest[0] as Event);
          break;
        case 'REQ':
          handleReq(client, rest[0] as string, rest.slice(1) as Filter[]);
          break;
        case 'CLOSE':
          client.subs.delete(rest[0] as string);
          send(ws, ['CLOSED', rest[0], '']);
          break;
        case 'AUTH': {
          const pk = verifyAuth(rest[0] as Event, client.challenge);
          if (pk) {
            client.authed = pk;
            send(ws, ['OK', (rest[0] as Event).id, true, '']);
          } else {
            send(ws, ['OK', (rest[0] as Event)?.id ?? '', false, 'auth failed']);
          }
          break;
        }
        default:
          send(ws, ['NOTICE', `unknown message type: ${String(type)}`]);
      }
    });

    ws.on('close', () => clients.delete(client));
    ws.on('error', () => clients.delete(client));
  });

  http.listen(config.port, () => {
    console.log(`[relay] ${config.info.name} on :${config.port} (ws + NIP-11)`);
  });
}
