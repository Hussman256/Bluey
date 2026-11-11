import type NDK from '@nostr-dev-kit/ndk';
import type { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';

/**
 * One-off query that doesn't depend on every relay answering. It finishes when
 * relays report they're done, when results have stopped arriving, or at maxMs,
 * and keeps whatever came in. `complete` is false if no relay reported done and
 * nothing arrived, which means "couldn't tell" rather than "there's nothing".
 */
export function collectEvents(
  ndk: NDK,
  filter: NDKFilter,
  { quietMs = 1500, maxMs = 8000 }: { quietMs?: number; maxMs?: number } = {},
): Promise<{ events: NDKEvent[]; complete: boolean }> {
  return new Promise((resolve) => {
    const found = new Map<string, NDKEvent>();
    let quiet: ReturnType<typeof setTimeout> | undefined;
    let finished = false;

    const finish = (eose: boolean) => {
      if (finished) return;
      finished = true;
      clearTimeout(quiet);
      clearTimeout(limit);
      sub.stop();
      resolve({ events: [...found.values()], complete: eose || found.size > 0 });
    };
    const limit = setTimeout(() => finish(false), maxMs);

    const sub = ndk.subscribe(filter, {
      closeOnEose: true,
      onEvent: (e) => {
        found.set(e.id, e as NDKEvent);
        clearTimeout(quiet);
        quiet = setTimeout(() => finish(false), quietMs);
      },
      onEose: () => finish(true),
    });
  });
}
