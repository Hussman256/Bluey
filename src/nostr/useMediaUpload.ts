import { NDKBlossom } from '@nostr-dev-kit/blossom';
import { useNDK } from '@nostr-dev-kit/react';
import { useCallback, useMemo, useState } from 'react';
import { BLOSSOM_FALLBACK, BLOSSOM_PRIMARY } from './config';

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
        const meta = await blossom.upload(file, {
          server: BLOSSOM_PRIMARY,
          fallbackServer: BLOSSOM_FALLBACK,
        });
        return meta.url ?? null;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [blossom],
  );

  return { upload, busy, error };
}
