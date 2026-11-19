import { NDKBlossom } from '@nostr-dev-kit/blossom';
import { useNDK } from '@nostr-dev-kit/react';
import { useCallback, useMemo, useState } from 'react';
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

/**
 * Upload media to a Blossom server (hash-addressed blobs on plain HTTP).
 * Returns the public URL to drop into note content.
 */
export function useMediaUpload() {
  const { ndk } = useNDK();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blossom = useMemo(() => (ndk ? new NDKBlossom(ndk) : null), [ndk]);

  const upload = useCallback(
    async (file: File): Promise<string | null> => {
      if (!blossom) return null;
      setBusy(true);
      setError(null);
      try {
        const meta = await blossom.upload(await shrinkImage(file, 2048), {
          server: BLOSSOM_PRIMARY,
          fallbackServer: BLOSSOM_FALLBACK,
        });
        return meta.url ?? null;
      } catch (e) {
        console.warn('[upload]', e);
        setError("Couldn't upload that photo. Check your connection and try again.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [blossom],
  );

  return { upload, busy, error };
}
