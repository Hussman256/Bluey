import { NDKEvent } from '@nostr-dev-kit/ndk';
import { useNDK } from '@nostr-dev-kit/react';
import { useCallback, useState } from 'react';
import { BLOSSOM_FALLBACK, BLOSSOM_PRIMARY } from './config';

/**
 * Scale a photo down to `max` px on its longest side and re-encode it as JPEG.
 * Phone photos are often 5–10 MB, which media servers reject or upload slowly.
 * Returns the original file if it is not an image or cannot be decoded.
 */
export async function shrinkImage(file: File, max = 1024): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1_000_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** base64 of a UTF-8 string (btoa alone breaks on non-Latin-1 characters). */
function b64(s: string): string {
  let bin = '';
  for (const byte of new TextEncoder().encode(s)) bin += String.fromCharCode(byte);
  return btoa(bin);
}

/**
 * Upload media to Blossom servers (BUD-01/02): a signed kind-24242 auth event in
 * the Authorization header, then PUT /upload with the raw bytes. Done by hand
 * rather than through @nostr-dev-kit/blossom, whose upload failed inside the
 * Android app while this same request succeeds. Returns the public URL.
 */
export function useMediaUpload() {
  const { ndk } = useNDK();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = useCallback(
    async (input: File): Promise<string | null> => {
      setBusy(true);
      setError(null);
      const reasons: string[] = [];
      try {
        if (!ndk?.signer) throw new Error('not signed in');
        const file = await shrinkImage(input, 2048);
        const bytes = await file.arrayBuffer();
        const hash = hex(await crypto.subtle.digest('SHA-256', bytes));
        const type = file.type || 'application/octet-stream';

        for (const server of [BLOSSOM_PRIMARY, BLOSSOM_FALLBACK]) {
          try {
            const now = Math.floor(Date.now() / 1000);
            const auth = new NDKEvent(ndk);
            auth.kind = 24242;
            auth.created_at = now;
            auth.content = 'Upload media';
            auth.tags = [
              ['t', 'upload'],
              ['x', hash],
              ['expiration', String(now + 3600)],
            ];
            await auth.sign();
            const res = await fetch(`${server.replace(/\/$/, '')}/upload`, {
              method: 'PUT',
              body: bytes,
              headers: { 'Content-Type': type, Authorization: `Nostr ${b64(JSON.stringify(auth.rawEvent()))}` },
            });
            if (!res.ok) {
              reasons.push(`${new URL(server).host} ${res.status}${res.headers.get('x-reason') ? ` ${res.headers.get('x-reason')}` : ''}`);
              continue;
            }
            const body = (await res.json().catch(() => ({}))) as { url?: string };
            return body.url || `${server.replace(/\/$/, '')}/${hash}`;
          } catch (e) {
            reasons.push(`${new URL(server).host}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        throw new Error(reasons.join('; '));
      } catch (e) {
        const why = e instanceof Error ? e.message : String(e);
        console.warn('[upload]', why);
        setError(`Couldn't upload that photo. Try again in a moment. (${why})`);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [ndk],
  );

  return { upload, busy, error };
}
