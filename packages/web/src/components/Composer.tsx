import type { PersonCard } from '@bluey/shared';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { useNDK, useNDKCurrentUser } from '@nostr-dev-kit/react';
import { useRef, useState } from 'react';
import { npubOf } from '../nostr/ids';
import { useMediaUpload } from '../nostr/useMediaUpload';
import { personLabel, useMentionSearch } from '../nostr/useMentionSearch';
import { KIND } from '../nostr/kinds';
import { Avatar } from './primitives';

const MENTION_AT_CARET = /(?:^|\s)@([\p{L}\p{N}_.-]{1,30})$/u;

/** Turn each picked "@Name" into a real Nostr mention, which other apps can link and notify. */
function applyMentions(text: string, picked: Map<string, string>) {
  let content = text;
  const pubkeys = new Set<string>();
  // longest first, so "@Ada Lovelace" isn't caught by "@Ada"
  for (const label of [...picked.keys()].sort((a, b) => b.length - a.length)) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`${escaped}(?![\\p{L}\\p{N}_])`, 'gu');
    const pubkey = picked.get(label)!;
    const replaced = content.replace(re, `nostr:${npubOf(pubkey)}`);
    if (replaced !== content) pubkeys.add(pubkey);
    content = replaced;
  }
  return { content, pubkeys };
}

export function Composer({
  replyTo,
  placeholder = "What's on your mind?",
  onPublished,
}: {
  replyTo?: NDKEvent;
  placeholder?: string;
  onPublished?: (e: NDKEvent) => void;
}) {
  const { ndk } = useNDK();
  const me = useNDKCurrentUser();
  const { upload, busy: uploading, error: uploadError } = useMediaUpload();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  // what's typed after "@" at the cursor, and who has been picked so far ("@Ada" → pubkey)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [activeMention, setActiveMention] = useState(0);
  const picked = useRef(new Map<string, string>());
  const suggestions = useMentionSearch(mentionQuery);
  const menuOpen = mentionQuery !== null && suggestions.length > 0;

  if (!me) return null;

  function onTextChange(value: string, caret: number) {
    setText(value);
    const m = value.slice(0, caret).match(MENTION_AT_CARET);
    setMentionQuery(m ? m[1] : null);
    setActiveMention(0);
  }

  function pickMention(person: PersonCard) {
    const area = areaRef.current;
    if (!area || mentionQuery === null) return;
    const caret = area.selectionStart;
    const start = caret - mentionQuery.length - 1;
    const label = `@${personLabel(person)}`;
    picked.current.set(label, person.pubkey);
    const next = `${text.slice(0, start)}${label} ${text.slice(caret)}`;
    setText(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      area.focus();
      const at = start + label.length + 1;
      area.setSelectionRange(at, at);
    });
  }

  async function addImage(file: File) {
    const url = await upload(file);
    if (url) setText((t) => (t ? `${t}\n${url}` : url));
  }

  async function publish() {
    if (!ndk || !text.trim() || busy) return;
    setBusy(true);
    setErr(null);
    const ev = new NDKEvent(ndk);
    ev.kind = KIND.Text;
    const { content, pubkeys } = applyMentions(text.trim(), picked.current);
    ev.content = content;
    if (replyTo) {
      const rootTag = replyTo.tags.find((t) => t[0] === 'e' && t[3] === 'root');
      const root = rootTag?.[1] ?? replyTo.id;
      ev.tags.push(['e', root, '', 'root']);
      if (root !== replyTo.id) ev.tags.push(['e', replyTo.id, '', 'reply']);
      ev.tags.push(['p', replyTo.pubkey]);
    }
    for (const pk of pubkeys) {
      if (pk !== replyTo?.pubkey) ev.tags.push(['p', pk]);
    }
    try {
      await ev.publish();
      setText('');
      picked.current.clear();
      onPublished?.(ev);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not publish');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-3 border-b border-line px-4 py-3.5">
      <Avatar pubkey={me.pubkey} />
      <div className="relative min-w-0 flex-1">
        <textarea
          ref={areaRef}
          value={text}
          onChange={(e) => onTextChange(e.target.value, e.target.selectionStart)}
          onBlur={() => setMentionQuery(null)}
          onKeyDown={(e) => {
            if (menuOpen) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const step = e.key === 'ArrowDown' ? 1 : -1;
                setActiveMention((i) => (i + step + suggestions.length) % suggestions.length);
                return;
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                pickMention(suggestions[Math.min(activeMention, suggestions.length - 1)]);
                return;
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setMentionQuery(null);
                return;
              }
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void publish();
          }}
          rows={replyTo ? 2 : 3}
          placeholder={placeholder}
          className="w-full resize-none bg-transparent text-[0.95rem] outline-none placeholder:text-ink-faint"
        />
        {menuOpen && (
          <ul className="absolute inset-x-0 top-full z-30 -mt-6 overflow-hidden rounded-xl border border-line-strong bg-bg py-1 shadow-lg" role="listbox" aria-label="People">
            {suggestions.map((p, i) => (
              <li key={p.pubkey} role="option" aria-selected={i === activeMention}>
                <button
                  type="button"
                  // keep focus in the textarea so its cursor position is still there
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickMention(p)}
                  className={`flex min-h-11 w-full items-center gap-2.5 px-3 py-1.5 text-left ${i === activeMention ? 'bg-surface' : ''}`}
                >
                  {p.picture ? (
                    <img src={p.picture} alt="" className="h-7 w-7 shrink-0 rounded-full bg-sunk object-cover" />
                  ) : (
                    <span className="h-7 w-7 shrink-0 rounded-full bg-brand-soft" aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{personLabel(p)}</span>
                    {p.nip05 && <span className="block truncate text-xs text-ink-faint">{p.nip05.replace(/^_@/, '')}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-1 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="text-ink-faint transition hover:text-ink disabled:opacity-40"
              aria-label="Add image"
            >
              {uploading ? (
                <span className="font-mono text-xs">uploading…</span>
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void addImage(f);
                e.target.value = '';
              }}
            />
            {(err || uploadError) && (
              <span className="text-xs text-danger">{err ?? uploadError}</span>
            )}
            {!err && !uploadError && (
              <span className="font-mono text-xs text-ink-faint">
                {text.length > 0 ? `${text.length}` : '⌘↵ to post'}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={publish}
            disabled={!text.trim() || busy}
            className="rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {busy ? '…' : replyTo ? 'Reply' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}
