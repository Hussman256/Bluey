import { config } from './config.ts';
import { q } from './db.ts';
import { relayPubkey } from './key.ts';
import { startRelay } from './relay.ts';

console.log('1btc clubs relay starting…');
console.log('  db:  ', config.dbPath);
console.log('  key: ', relayPubkey);

startRelay();

setInterval(() => {
  const g = Number((q.get<{ n: number }>(`SELECT count(*) n FROM groups`) ?? { n: 0 }).n);
  const m = Number((q.get<{ n: number }>(`SELECT count(*) n FROM group_members`) ?? { n: 0 }).n);
  const e = Number((q.get<{ n: number }>(`SELECT count(*) n FROM events`) ?? { n: 0 }).n);
  console.log(`[stats] groups=${g} members=${m} events=${e}`);
}, 60_000);
