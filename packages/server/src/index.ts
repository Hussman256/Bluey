import { startApi } from './api.ts';
import { config } from './config.ts';
import { pruneOld, stats } from './db.ts';
import { backfill, shutdownRelays, startFirehose } from './relays.ts';
import { recomputeWot } from './wot.ts';

console.log('1btc index service starting…');
console.log('  db:', config.dbPath);
console.log('  relays:', config.relays.join(', '));

startApi();
startFirehose();
backfill();

// periodic jobs
const wotTimer = setInterval(() => {
  const r = recomputeWot();
  console.log(`[wot] recomputed ${r.nodes} nodes in ${r.ms}ms`);
}, config.wotIntervalMs);

const pruneTimer = setInterval(() => {
  const n = pruneOld();
  if (n) console.log(`[prune] removed ${n} stale events`);
}, config.pruneIntervalMs);

// first wot pass once some follow data is in
setTimeout(() => {
  const r = recomputeWot();
  console.log(`[wot] first pass: ${r.nodes} nodes in ${r.ms}ms`);
}, 45_000);

// heartbeat
setInterval(() => {
  const s = stats();
  console.log(
    `[stats] events=${s.events} profiles=${s.profiles} follows=${s.follows} edges=${s.edges} scored=${s.scored}`,
  );
}, 60_000);

function shutdown() {
  console.log('\nshutting down…');
  clearInterval(wotTimer);
  clearInterval(pruneTimer);
  shutdownRelays();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
