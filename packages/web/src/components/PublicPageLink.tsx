import { useState } from 'react';
import { Link } from 'react-router-dom';
import { NAME_DOMAIN } from '../nostr/accountApi';
import { npubOf } from '../nostr/ids';

/** "Your public page" card: the /@name proof-of-work page, with a copy button. */
export function PublicPageLink({ pubkey, nip05 }: { pubkey: string; nip05?: string }) {
  const [copied, setCopied] = useState(false);
  const ours = nip05?.toLowerCase().endsWith(`@${NAME_DOMAIN}`);
  const handle = ours ? nip05!.split('@')[0].toLowerCase() : npubOf(pubkey);
  const path = `/@${handle}`;
  const shown = ours ? `${NAME_DOMAIN}/@${handle}` : `${NAME_DOMAIN}/@${handle.slice(0, 12)}…`;

  return (
    <div className="mt-4 flex items-center gap-3 rounded-[18px] border border-line bg-surface px-3.5 py-3">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold">Your public page</span>
        <Link to={path} className="truncate font-mono text-xs text-brand hover:underline">
          {shown}
        </Link>
        {!ours && (
          <Link to="/settings" className="text-xs text-ink-faint hover:text-ink">
            Claim a name for a shorter link
          </Link>
        )}
      </span>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard?.writeText(`${window.location.origin}${path}`);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="min-h-10 shrink-0 rounded-xl border border-line-strong px-3.5 text-sm font-semibold"
      >
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </div>
  );
}
