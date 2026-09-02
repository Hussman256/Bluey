import { createServer } from 'node:http';
import type {
  CountsParams,
  FeedParams,
  Frame,
  NotesParams,
  NotificationsParams,
  ProfileParams,
  Request,
  SearchParams,
  ThreadParams,
  WotParams,
} from '@1btc/shared';
import { WebSocketServer } from 'ws';
import { config } from './config.ts';
import { stats } from './db.ts';
import * as q from './queries.ts';
import { relayStats } from './relays.ts';

function handle(req: Request): Frame {
  const base = { id: req.id, done: true } as const;
  try {
    switch (req.method) {
      case 'feed':
        return { ...base, events: q.feed(req.params as FeedParams) };
      case 'thread': {
        const p = req.params as ThreadParams;
        return { ...base, events: q.thread(p.id, p.limit) };
      }
      case 'profile': {
        const r = q.profile((req.params as ProfileParams).pubkey);
        return { ...base, events: r.events, counts: r.counts };
      }
      case 'notes':
        return { ...base, events: q.notes(req.params as NotesParams) };
      case 'notifications': {
        const p = req.params as NotificationsParams;
        return { ...base, notifications: q.notifications(p.pubkey, p.since, p.limit) };
      }
      case 'search': {
        const p = req.params as SearchParams;
        return { ...base, events: q.search(p.q, p.limit) };
      }
      case 'counts':
        return { ...base, counts: q.counts((req.params as CountsParams).ids) };
      case 'wot': {
        const p = req.params as WotParams;
        return { ...base, score: q.wotScore(p.pubkey, p.from) };
      }
      default:
        return { ...base, error: `unknown method: ${req.method}` };
    }
  } catch (e) {
    return { ...base, error: e instanceof Error ? e.message : String(e) };
  }
}

export function startApi() {
  const http = createServer((httpReq, res) => {
    if (httpReq.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, db: stats(), relays: relayStats() }));
      return;
    }
    res.writeHead(404).end();
  });

  const wss = new WebSocketServer({ server: http });

  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      let req: Request;
      try {
        req = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ id: '?', done: true, error: 'bad json' }));
        return;
      }
      if (!req?.id || !req.method) {
        ws.send(JSON.stringify({ id: req?.id ?? '?', done: true, error: 'missing id/method' }));
        return;
      }
      const frame = handle(req);
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(frame));
    });
  });

  http.listen(config.port, () => {
    console.log(`[api] ws + http on :${config.port}  (health: http://localhost:${config.port}/health)`);
  });

  return { http, wss };
}
