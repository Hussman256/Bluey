import { NDKEvent } from '@nostr-dev-kit/ndk';
import { useNDK, useNDKCurrentUser } from '@nostr-dev-kit/react';
import { useState } from 'react';
import { KIND } from '../nostr/kinds';
import { Avatar } from './primitives';

export function Composer({
  replyTo,
  placeholder = "What are you building?",
  onPublished,
}: {
  replyTo?: NDKEvent;
  placeholder?: string;
  onPublished?: (e: NDKEvent) => void;
}) {
  const { ndk } = useNDK();
  const me = useNDKCurrentUser();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!me) return null;

  async function publish() {
    if (!ndk || !text.trim() || busy) return;
    setBusy(true);
    setErr(null);
    const ev = new NDKEvent(ndk);
    ev.kind = KIND.Text;
    ev.content = text.trim();
    if (replyTo) {
      const root =
        replyTo.tags.find((t) => t[0] === 'e' && t[3] === 'root')?.[1] ?? replyTo.id;
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
          {err ? (
            <span className="text-xs text-danger">{err}</span>
          ) : (
            <span className="font-mono text-xs text-ink-faint">
              {text.length > 0 ? `${text.length}` : '⌘↵ to post'}
            </span>
          )}
          <button
            type="button"
            onClick={publish}
            disabled={!text.trim() || busy}
            className="rounded-full bg-zap px-4 py-1.5 text-sm font-semibold text-bg transition hover:opacity-90 disabled:opacity-40"
          >
            {busy ? '…' : replyTo ? 'Reply' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}
