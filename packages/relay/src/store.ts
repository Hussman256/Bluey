import { KIND } from '@1btc/shared';
import type { Event } from 'nostr-tools/pure';
import type { Filter } from 'nostr-tools/filter';
import { groupIdOf } from './groups.ts';
import { q } from './db.ts';

const ADDRESSABLE = new Set<number>([KIND.GroupMetadata, KIND.GroupAdmins, KIND.GroupMembers]);

export function storeEvent(ev: Event) {
  const groupId = groupIdOf(ev);
  const dTag = ev.tags.find((t) => t[0] === 'd')?.[1] ?? null;

  // addressable events: keep only the newest per (kind, pubkey, d)
  if (ADDRESSABLE.has(ev.kind) && dTag) {
    q.run(`DELETE FROM events WHERE kind = ? AND pubkey = ? AND d_tag = ?`, ev.kind, ev.pubkey, dTag);
  }

  q.run(
    `INSERT OR IGNORE INTO events (id, pubkey, created_at, kind, content, tags, sig, group_id, d_tag)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ev.id,
    ev.pubkey,
    ev.created_at,
    ev.kind,
    ev.content,
    JSON.stringify(ev.tags),
    ev.sig,
    groupId,
    dTag,
  );
}

interface Row {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  content: string;
  tags: string;
  sig: string;
}
const toEvent = (r: Row): Event => ({
  id: r.id,
  pubkey: r.pubkey,
  created_at: r.created_at,
  kind: r.kind,
  content: r.content,
  tags: JSON.parse(r.tags),
  sig: r.sig,
});

/** Translate one Nostr filter into SQL against the stored events. */
export function queryFilter(f: Filter): Event[] {
  const where: string[] = [];
  const args: Array<string | number> = [];

  if (f.ids?.length) {
    where.push(`id IN (${f.ids.map(() => '?').join(',')})`);
    args.push(...f.ids);
  }
  if (f.authors?.length) {
    where.push(`pubkey IN (${f.authors.map(() => '?').join(',')})`);
    args.push(...f.authors);
  }
  if (f.kinds?.length) {
    where.push(`kind IN (${f.kinds.map(() => '?').join(',')})`);
    args.push(...f.kinds);
  }
  if (typeof f.since === 'number') {
    where.push(`created_at >= ?`);
    args.push(f.since);
  }
  if (typeof f.until === 'number') {
    where.push(`created_at <= ?`);
    args.push(f.until);
  }
  const hTag = (f as Record<string, unknown>)['#h'] as string[] | undefined;
  if (hTag?.length) {
    where.push(`group_id IN (${hTag.map(() => '?').join(',')})`);
    args.push(...hTag);
  }
  const dTag = (f as Record<string, unknown>)['#d'] as string[] | undefined;
  if (dTag?.length) {
    where.push(`d_tag IN (${dTag.map(() => '?').join(',')})`);
    args.push(...dTag);
  }

  const limit = Math.min(f.limit ?? 500, 1000);
  const sql = `SELECT * FROM events ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ${limit}`;
  const rows = q.all<Row>(sql, ...args);

  // tag filters we didn't push to SQL (#e, #p, …) — apply in JS
  const jsTagFilters = Object.entries(f).filter(
    ([k]) => k.startsWith('#') && k !== '#h' && k !== '#d',
  ) as Array<[string, string[]]>;

  return rows
    .map(toEvent)
    .filter((ev) =>
      jsTagFilters.every(([k, vals]) => {
        const name = k.slice(1);
        return ev.tags.some((t) => t[0] === name && vals.includes(t[1]));
      }),
    );
}
