import { NDKEvent } from '@nostr-dev-kit/ndk';
import { useNDK, useNDKCurrentUser } from '@nostr-dev-kit/react';
import { useRef, useState } from 'react';
import { useMediaUpload } from '../nostr/useMediaUpload';
import { KIND } from '../nostr/kinds';
import { Avatar } from './primitives';

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

  if (!me) return null;

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
    ev.content = text.trim();
    if (replyTo) {
      const rootTag = replyTo.tags.find((t) => t[0] === 'e' && t[3] === 'root');
      const root = rootTag?.[1] ?? replyTo.id;
      ev.tags.push(['e', root, '', 'root']);
      if (root !== replyTo.id) ev.tags.push(['e', replyTo.id, '', 'reply']);
      ev.tags.push(['p', replyTo.pubkey]);
    }
    try {
      await ev.publish();
      setText('');
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
      <div className="flex-1">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void publish();
          }}
          rows={replyTo ? 2 : 3}
          placeholder={placeholder}
          className="w-full resize-none bg-transparent text-[0.95rem] outline-none placeholder:text-ink-faint"
        />
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
            className="rounded-full bg-zap px-4 py-1.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {busy ? '…' : replyTo ? 'Reply' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}
