import { NDKEvent } from '@nostr-dev-kit/ndk';
import { useNDK, useSubscribe } from '@nostr-dev-kit/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { KIND } from '../nostr/kinds';
import { useMediaUpload } from '../nostr/useMediaUpload';

type Fields = {
  display_name: string;
  name: string;
  about: string;
  picture: string;
  banner: string;
  nip05: string;
  lud16: string;
};

const EMPTY: Fields = {
  display_name: '',
  name: '',
  about: '',
  picture: '',
  banner: '',
  nip05: '',
  lud16: '',
};

/** Edit + publish the signed-in user's kind:0 profile. */
export function EditProfile({ pubkey, onClose }: { pubkey: string; onClose: () => void }) {
  const { ndk } = useNDK();
  const { upload, busy: uploading } = useMediaUpload();

  // the current kind:0 — kept raw so unknown fields (website, bot, …) survive a save
  const { events } = useSubscribe(
    [{ kinds: [KIND.Metadata], authors: [pubkey], limit: 1 }],
    { closeOnEose: true },
    [pubkey],
  );
  const current = useMemo(() => {
    const e = events.slice().sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))[0];
    if (!e) return null;
    try {
      return JSON.parse(e.content) as Record<string, unknown>;
    } catch {
      return null;
    }
  }, [events]);

  const [f, setF] = useState<Fields>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const seeded = useRef(false);
  const picRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (seeded.current || !current) return;
    seeded.current = true;
    setF({
      display_name: String(current.display_name ?? current.displayName ?? ''),
      name: String(current.name ?? ''),
      about: String(current.about ?? ''),
      picture: String(current.picture ?? ''),
      banner: String(current.banner ?? ''),
      nip05: String(current.nip05 ?? ''),
      lud16: String(current.lud16 ?? ''),
    });
  }, [current]);

  const set = (k: keyof Fields) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  async function pickImage(kind: 'picture' | 'banner', file: File) {
    const url = await upload(file);
    if (url) set(kind)(url);
  }

  async function save() {
    if (!ndk?.signer || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const merged: Record<string, unknown> = { ...(current ?? {}) };
      for (const [k, v] of Object.entries(f)) {
        if (v.trim()) merged[k] = v.trim();
        else delete merged[k];
      }
      const ev = new NDKEvent(ndk);
      ev.kind = KIND.Metadata;
      ev.content = JSON.stringify(merged);
      const relays = await ev.publish(undefined, 6000);
      if (relays.size === 0) throw new Error('No relay accepted the update — try again');
      // NDK keeps the previous kind:0 cached; a reload is the reliable way to
      // show the new name/picture everywhere at once.
      window.location.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save');
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-slab/30 sm:items-center sm:p-4"
      onMouseDown={() => !busy && onClose()}
    >
      <div
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-bg p-5 shadow-xl sm:rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 font-display text-lg font-extrabold">Edit profile</h2>

        <Field label="Display name">
          <input className={inputCls} value={f.display_name} onChange={(e) => set('display_name')(e.target.value)} placeholder="Satoshi" />
        </Field>
        <Field label="Username" hint="the @handle other clients show">
          <input className={inputCls} value={f.name} onChange={(e) => set('name')(e.target.value)} placeholder="satoshi" />
        </Field>
        <Field label="Bio">
          <textarea className={`${inputCls} resize-none`} rows={3} value={f.about} onChange={(e) => set('about')(e.target.value)} />
        </Field>

        <Field label="Picture">
          <div className="flex items-center gap-3">
            {f.picture ? (
              <img src={f.picture} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="h-12 w-12 shrink-0 rounded-full bg-zap-soft" />
            )}
            <input className={inputCls} value={f.picture} onChange={(e) => set('picture')(e.target.value)} placeholder="https://… or upload" />
            <button type="button" onClick={() => picRef.current?.click()} disabled={uploading} className={uploadBtnCls}>
              {uploading ? '…' : 'Upload'}
            </button>
            <input ref={picRef} type="file" accept="image/*" hidden onChange={(e) => { const x = e.target.files?.[0]; if (x) void pickImage('picture', x); e.target.value = ''; }} />
          </div>
        </Field>

        <Field label="Banner">
          <div className="flex items-center gap-3">
            <input className={inputCls} value={f.banner} onChange={(e) => set('banner')(e.target.value)} placeholder="https://… or upload" />
            <button type="button" onClick={() => bannerRef.current?.click()} disabled={uploading} className={uploadBtnCls}>
              {uploading ? '…' : 'Upload'}
            </button>
            <input ref={bannerRef} type="file" accept="image/*" hidden onChange={(e) => { const x = e.target.files?.[0]; if (x) void pickImage('banner', x); e.target.value = ''; }} />
          </div>
        </Field>

        <Field label="NIP-05 identifier" hint="you@domain.com — verifies your name">
          <input className={inputCls} value={f.nip05} onChange={(e) => set('nip05')(e.target.value)} placeholder="you@example.com" />
        </Field>
        <Field label="Lightning address" hint="where zaps are received">
          <input className={inputCls} value={f.lud16} onChange={(e) => set('lud16')(e.target.value)} placeholder="you@getalby.com" />
        </Field>

        {err && <p className="mb-2 text-xs text-danger">{err}</p>}
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-full px-4 py-2 text-sm font-semibold text-ink-faint hover:text-ink disabled:opacity-40">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={busy || !ndk?.signer} className="rounded-full bg-zap px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  'min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm outline-none focus:border-zap placeholder:text-ink-faint';
const uploadBtnCls =
  'shrink-0 rounded-lg border border-line-strong px-3 py-2 text-xs font-semibold text-ink-soft hover:border-zap hover:text-zap-ink disabled:opacity-40';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="mb-3.5 block">
      <span className="mb-1 block text-xs font-semibold text-ink-soft">
        {label}
        {hint && <span className="ml-2 font-normal text-ink-faint">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
