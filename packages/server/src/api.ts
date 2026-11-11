import { createServer } from 'node:http';
import type {
  CountsParams,
  FeedParams,
  FollowersParams,
  Frame,
  NotesParams,
  NotificationsParams,
  PeopleParams,
  ProfileParams,
  Request,
  SearchParams,
  SuggestParams,
  ThreadParams,
  WotParams,
} from '@bluey/shared';
import { WebSocketServer } from 'ws';
import { config } from './config.ts';
import { stats } from './db.ts';
import * as q from './queries.ts';
import { handleAccountsHttp } from './accounts.ts';
import { handleLearningHttp } from './learning.ts';
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
      case 'suggest': {
        const p = req.params as SuggestParams;
        const topics = Array.isArray(p.topics) ? p.topics.map(String).slice(0, 10) : [];
        return { ...base, pubkeys: q.suggestPubkeys(topics, Math.min(Number(p.limit) || 24, 60)) };
      }
      case 'people': {
        const p = req.params as PeopleParams;
        return { ...base, people: q.people(String(p.q ?? ''), Number(p.limit) || 8) };
      }
      case 'followers': {
        const p = req.params as FollowersParams;
        return { ...base, ...q.followers(p.pubkey, Number(p.limit) || 200) };
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
    void (async () => {
      if (await handleLearningHttp(httpReq, res)) return;
      if (!(await handleAccountsHttp(httpReq, res))) res.writeHead(404).end();
    })().catch((e) => {
      console.error('[http]', e);
      if (!res.headersSent) res.writeHead(500).end();
    });
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
