import { zapInvoiceFromEvent } from '@nostr-dev-kit/ndk';
import { useSubscribe } from '@nostr-dev-kit/react';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { KIND } from './kinds';

export interface NoteStats {
  reactions: number;
  reposts: number;
  replies: number;
  zapCount: number;
  zapSats: number;
}

const EMPTY: NoteStats = { reactions: 0, reposts: 0, replies: 0, zapCount: 0, zapSats: 0 };

const Ctx = createContext<Map<string, NoteStats>>(new Map());

/**
 * One subscription for the engagement of every note currently on screen.
 * Wrap a list of NoteCards in this; each card reads its row with useNoteStats.
 * Replaces N per-note subscriptions with 1.
 */
export function EngagementScope({ ids, children }: { ids: string[]; children: ReactNode }) {
  const key = useMemo(() => ids.slice().sort().join(','), [ids]);

  const { events } = useSubscribe(
    ids.length
      ? [{ kinds: [KIND.Reaction, KIND.Repost, KIND.Text, KIND.ZapReceipt], '#e': ids }]
      : false,
    { closeOnEose: false },
    [key],
  );

  const map = useMemo(() => {
    const m = new Map<string, NoteStats>();
    const bump = (id: string): NoteStats => {
      let s = m.get(id);
      if (!s) {
        s = { ...EMPTY };
        m.set(id, s);
      }
      return s;
    };
    for (const e of events) {
      // an event can tag several notes; count it against each tagged id we track
      for (const t of e.tags) {
        if (t[0] !== 'e' || !ids.includes(t[1])) continue;
        const s = bump(t[1]);
        if (e.kind === KIND.Reaction) s.reactions++;
        else if (e.kind === KIND.Repost) s.reposts++;
        else if (e.kind === KIND.Text) s.replies++;
        else if (e.kind === KIND.ZapReceipt) {
          s.zapCount++;
          const inv = zapInvoiceFromEvent(e);
          if (inv?.amount) s.zapSats += Math.round(inv.amount / 1000);
        }
      }
    }
    return m;
  }, [events, ids]);

  return <Ctx.Provider value={map}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNoteStats(id?: string): NoteStats {
  const map = useContext(Ctx);
  return (id && map.get(id)) || EMPTY;
}
