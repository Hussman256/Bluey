import { INGEST_KINDS, KIND, type NostrEventLike } from '@1btc/shared';
import { type Filter, SimplePool, verifyEvent } from 'nostr-tools';
import { config } from './config.ts';
import { ingest } from './db.ts';

const pool = new SimplePool();

let ingested = 0;
let rejected = 0;

function handle(ev: NostrEventLike) {
  if (!ev?.id || !ev.sig || !Array.isArray(ev.tags)) return;
  if (!INGEST_KINDS.includes(ev.kind)) return;
  try {
    if (!verifyEvent(ev as never)) {
      rejected++;
      return;
    }
  } catch {
    rejected++;
    return;
  }
  if (ingest(ev)) ingested++;
}

/** Live firehose: everything new across the relay set. */
export function startFirehose() {
  const since = Math.floor(Date.now() / 1000) - 60 * 10;
  pool.subscribeMany(config.relays, { kinds: INGEST_KINDS, since }, {
    onevent: handle,
    oneose: () => console.log('[relays] firehose caught up'),
  });
  console.log(
    `[relays] firehose on ${config.relays.length} relays, kinds ${INGEST_KINDS.join(',')}`,
  );
}

/** One-shot backfill of recent history so the feed isn't empty on a cold start. */
export function backfill() {
  const sixH = Math.floor(Date.now() / 1000) - 60 * 60 * 6;
  const jobs: Array<{ filter: Filter; label: string }> = [
    { filter: { kinds: [KIND.Text, KIND.Repost], since: sixH, limit: 2000 }, label: 'notes' },
    { filter: { kinds: [KIND.Metadata, KIND.Contacts], limit: 1500 }, label: 'graph' },
    { filter: { kinds: [KIND.Reaction, KIND.ZapReceipt], since: sixH, limit: 3000 }, label: 'edges' },
  ];
  for (const job of jobs) {
    const sub = pool.subscribeMany(config.relays, job.filter, {
      onevent: handle,
      oneose: () => {
        console.log(`[relays] backfill:${job.label} complete`);
        sub.close();
      },
    });
  }
}

export function relayStats() {
  return { ingested, rejected };
}

export function shutdownRelays() {
  pool.close(config.relays);
}
