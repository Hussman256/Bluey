import { KIND } from '@1btc/shared';
import { finalizeEvent, type Event, type EventTemplate } from 'nostr-tools/pure';
import { config } from './config.ts';
import { q } from './db.ts';
import { relaySecretKey } from './key.ts';

const MEMBER_WRITE = new Set<number>([
  KIND.GroupChatMessage,
  KIND.GroupChatReply,
  KIND.GroupThread,
  KIND.GroupThreadReply,
]);
const ADMIN_WRITE = new Set<number>([
  KIND.GroupAddUser,
  KIND.GroupRemoveUser,
  KIND.GroupEditMetadata,
  KIND.GroupDeleteEvent,
  KIND.GroupDelete,
]);
const RELAY_GENERATED = new Set<number>([
  KIND.GroupMetadata,
  KIND.GroupAdmins,
  KIND.GroupMembers,
]);

export const isRelayGenerated = (kind: number) => RELAY_GENERATED.has(kind);

export function groupIdOf(ev: { tags: string[][] }): string | null {
  return ev.tags.find((t) => t[0] === 'h')?.[1] ?? null;
}

export function isMember(groupId: string, pubkey: string): boolean {
  return !!q.get(`SELECT 1 FROM group_members WHERE group_id = ? AND pubkey = ?`, groupId, pubkey);
}
export function isAdmin(groupId: string, pubkey: string): boolean {
  const r = q.get<{ role: string }>(
    `SELECT role FROM group_members WHERE group_id = ? AND pubkey = ?`,
    groupId,
    pubkey,
  );
  return r?.role === 'admin' || r?.role === 'owner';
}
export function groupExists(groupId: string): boolean {
  return !!q.get(`SELECT 1 FROM groups WHERE id = ?`, groupId);
}

function sign(t: EventTemplate): Event {
  return finalizeEvent(t, relaySecretKey);
}

/** Rebuild the relay-signed 39000/39001/39002 events for a group. */
export function regenMetadata(groupId: string): Event[] {
  const g = q.get<{
    name: string | null;
    about: string | null;
    picture: string | null;
    is_open: number;
    is_public: number;
  }>(`SELECT name, about, picture, is_open, is_public FROM groups WHERE id = ?`, groupId);
  if (!g) return [];

  const members = q.all<{ pubkey: string; role: string }>(
    `SELECT pubkey, role FROM group_members WHERE group_id = ? ORDER BY added_at ASC`,
    groupId,
  );
  const now = Math.floor(Date.now() / 1000);

  const meta = sign({
    kind: KIND.GroupMetadata,
    created_at: now,
    content: '',
    tags: [
      ['d', groupId],
      ...(g.name ? [['name', g.name]] : []),
      ...(g.about ? [['about', g.about]] : []),
      ...(g.picture ? [['picture', g.picture]] : []),
      [g.is_public ? 'public' : 'private'],
      [g.is_open ? 'open' : 'closed'],
    ],
  });
  const admins = sign({
    kind: KIND.GroupAdmins,
    created_at: now,
    content: '',
    tags: [
      ['d', groupId],
      ...members
        .filter((m) => m.role === 'admin' || m.role === 'owner')
        .map((m) => ['p', m.pubkey, m.role]),
    ],
  });
  const memberList = sign({
    kind: KIND.GroupMembers,
    created_at: now,
    content: '',
    tags: [['d', groupId], ...members.map((m) => ['p', m.pubkey])],
  });

  // replace stored copies
  for (const kind of RELAY_GENERATED) {
    q.run(`DELETE FROM events WHERE kind = ? AND d_tag = ?`, kind, groupId);
  }
  return [meta, admins, memberList];
}

export interface GroupResult {
  ok: boolean;
  msg: string;
  /** relay-generated events to store + broadcast */
  generated?: Event[];
  /** true when the incoming event itself should NOT be stored (e.g. join/leave requests) */
  drop?: boolean;
}

/**
 * Apply NIP-29 rules to an incoming group event. Returns whether to accept it,
 * plus any relay-generated follow-up events.
 */
export function handleGroupEvent(ev: Event, authed: string | null): GroupResult {
  // clients must not forge relay-generated events
  if (RELAY_GENERATED.has(ev.kind)) {
    return { ok: false, msg: 'blocked: relay-generated kind' };
  }

  const groupId = groupIdOf(ev);

  // ---- create group ----
  if (ev.kind === KIND.GroupCreate) {
    const id = groupId ?? ev.tags.find((t) => t[0] === 'd')?.[1];
    if (!id) return { ok: false, msg: 'invalid: create needs an h/d tag' };
    if (groupExists(id)) return { ok: false, msg: 'duplicate: group exists' };
    const now = Math.floor(Date.now() / 1000);
    q.run(
      `INSERT INTO groups (id, name, about, picture, is_open, is_public, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      id,
      ev.tags.find((t) => t[0] === 'name')?.[1] ?? null,
      ev.tags.find((t) => t[0] === 'about')?.[1] ?? null,
      ev.tags.find((t) => t[0] === 'picture')?.[1] ?? null,
      config.defaultOpen ? 1 : 0,
      ev.pubkey,
      now,
    );
    q.run(
      `INSERT INTO group_members (group_id, pubkey, role, added_at) VALUES (?, ?, 'owner', ?)`,
      id,
      ev.pubkey,
      now,
    );
    return { ok: true, msg: '', generated: regenMetadata(id) };
  }

  if (!groupId) return { ok: false, msg: 'invalid: missing h tag' };
  if (!groupExists(groupId)) return { ok: false, msg: 'invalid: unknown group' };

  // ---- join (free groups auto-approve) ----
  if (ev.kind === KIND.GroupJoinRequest) {
    const g = q.get<{ is_open: number }>(`SELECT is_open FROM groups WHERE id = ?`, groupId);
    if (isMember(groupId, ev.pubkey)) return { ok: true, msg: 'already a member', drop: true };
    if (!g?.is_open) return { ok: true, msg: 'pending: closed group, awaiting admin', drop: true };
    q.run(
      `INSERT OR IGNORE INTO group_members (group_id, pubkey, role, added_at) VALUES (?, ?, 'member', ?)`,
      groupId,
      ev.pubkey,
      Math.floor(Date.now() / 1000),
    );
    return { ok: true, msg: '', drop: true, generated: regenMetadata(groupId) };
  }

  // ---- leave ----
  if (ev.kind === KIND.GroupLeaveRequest) {
    q.run(`DELETE FROM group_members WHERE group_id = ? AND pubkey = ?`, groupId, ev.pubkey);
    return { ok: true, msg: '', drop: true, generated: regenMetadata(groupId) };
  }

  // ---- admin actions ----
  if (ADMIN_WRITE.has(ev.kind)) {
    if (!authed || authed !== ev.pubkey) return { ok: false, msg: 'auth-required: sign in' };
    if (!isAdmin(groupId, ev.pubkey)) return { ok: false, msg: 'restricted: admins only' };
    const now = Math.floor(Date.now() / 1000);

    if (ev.kind === KIND.GroupAddUser) {
      const target = ev.tags.find((t) => t[0] === 'p')?.[1];
      if (!target) return { ok: false, msg: 'invalid: no p tag' };
      const role = ev.tags.find((t) => t[0] === 'p')?.[2] ?? 'member';
      q.run(
        `INSERT INTO group_members (group_id, pubkey, role, added_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(group_id, pubkey) DO UPDATE SET role = excluded.role`,
        groupId,
        target,
        role === 'admin' ? 'admin' : 'member',
        now,
      );
      return { ok: true, msg: '', generated: regenMetadata(groupId) };
    }
    if (ev.kind === KIND.GroupRemoveUser) {
      const target = ev.tags.find((t) => t[0] === 'p')?.[1];
      if (target) q.run(`DELETE FROM group_members WHERE group_id = ? AND pubkey = ?`, groupId, target);
      return { ok: true, msg: '', generated: regenMetadata(groupId) };
    }
    if (ev.kind === KIND.GroupEditMetadata) {
      const t = (name: string) => ev.tags.find((x) => x[0] === name)?.[1] ?? null;
      q.run(
        `UPDATE groups SET name = COALESCE(?, name), about = COALESCE(?, about), picture = COALESCE(?, picture) WHERE id = ?`,
        t('name'),
        t('about'),
        t('picture'),
        groupId,
      );
      return { ok: true, msg: '', generated: regenMetadata(groupId) };
    }
    if (ev.kind === KIND.GroupDeleteEvent) {
      const target = ev.tags.find((x) => x[0] === 'e')?.[1];
      if (target) q.run(`DELETE FROM events WHERE id = ? AND group_id = ?`, target, groupId);
      return { ok: true, msg: '' };
    }
    if (ev.kind === KIND.GroupDelete) {
      q.run(`DELETE FROM groups WHERE id = ?`, groupId);
      q.run(`DELETE FROM group_members WHERE group_id = ?`, groupId);
      q.run(`DELETE FROM events WHERE group_id = ? OR d_tag = ?`, groupId, groupId);
      return { ok: true, msg: '', drop: true };
    }
  }

  // ---- member content ----
  if (MEMBER_WRITE.has(ev.kind)) {
    if (!authed || authed !== ev.pubkey) return { ok: false, msg: 'auth-required: sign in to post' };
    if (!isMember(groupId, ev.pubkey)) return { ok: false, msg: 'restricted: join the club to post' };
    return { ok: true, msg: '' };
  }

  return { ok: false, msg: 'blocked: unsupported group event' };
}
