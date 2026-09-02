import { NDKEvent, NDKUser, NDKZapper } from '@nostr-dev-kit/ndk';
import { NDKNWCWallet } from '@nostr-dev-kit/wallet';
import { useNDK } from '@nostr-dev-kit/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { LS } from '../nostr/config';
import type { Wallet, ZapResult, ZapTarget } from './types';

type Status = 'disconnected' | 'connecting' | 'connected' | 'error';

interface WalletCtx {
  wallet: Wallet | null;
  status: Status;
  error: string | null;
  balance: number | null;
  connectNwc: (uri: string) => Promise<void>;
  disconnect: () => Promise<void>;
  refreshBalance: () => Promise<void>;
}

const Ctx = createContext<WalletCtx | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const { ndk } = useNDK();
  const [nwc, setNwc] = useState<NDKNWCWallet | null>(null);
  const [status, setStatus] = useState<Status>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  // keep NDK's wallet reference in sync with our React state.
  // NDK is an imperative singleton; assigning `ndk.wallet` from an effect is the
  // intended integration point.
  useEffect(() => {
    if (!ndk) return;
    // oxlint-disable-next-line react/immutability
    ndk.wallet = nwc ?? undefined;
  }, [ndk, nwc]);

  const connectNwc = useCallback(
    async (uri: string) => {
      if (!ndk) return;
      setStatus('connecting');
      setError(null);
      try {
        const w = new NDKNWCWallet(ndk, { pairingCode: uri.trim(), timeout: 20_000 });
        await w.getInfo();
        localStorage.setItem(LS.nwc, uri.trim());
        setNwc(w);
        setStatus('connected');
        try {
          await w.updateBalance();
          setBalance(w.balance?.amount ?? null);
        } catch {
          setBalance(null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not reach that wallet');
        setStatus('error');
        setNwc(null);
      }
    },
    [ndk],
  );

  const disconnect = useCallback(async () => {
    localStorage.removeItem(LS.nwc);
    setNwc(null);
    setBalance(null);
    setStatus('disconnected');
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!nwc) return;
    try {
      await nwc.updateBalance();
      setBalance(nwc.balance?.amount ?? null);
    } catch {
      setBalance(null);
    }
  }, [nwc]);

  // reconnect a previously paired wallet on load (external-system sync)
  useEffect(() => {
    if (!ndk || nwc || status !== 'disconnected') return;
    const saved = localStorage.getItem(LS.nwc);
    // oxlint-disable-next-line react/set-state-in-effect
    if (saved) void connectNwc(saved);
  }, [ndk, nwc, status, connectNwc]);

  const wallet = useMemo<Wallet | null>(() => {
    if (!ndk || !nwc) return null;
    return {
      info: { kind: 'nwc', label: 'Connected wallet (NWC)', canSend: true },
      async getBalance() {
        try {
          await nwc.updateBalance();
          return nwc.balance?.amount ?? null;
        } catch {
          return null;
        }
      },
      async sendZap(target: ZapTarget, amountSats: number, comment?: string): Promise<ZapResult> {
        try {
          let zapTarget: NDKEvent | NDKUser;
          if (target.eventId) {
            const ev = new NDKEvent(ndk);
            ev.id = target.eventId;
            ev.pubkey = target.pubkey;
            zapTarget = ev;
          } else {
            zapTarget = ndk.getUser({ pubkey: target.pubkey });
          }
          const zapper = new NDKZapper(zapTarget, amountSats, 'sat', { comment });
          const results = await zapper.zap();
          for (const [, res] of results) {
            if (res instanceof Error) return { ok: false, amountSats, error: res.message };
          }
          return { ok: true, amountSats };
        } catch (e) {
          return { ok: false, amountSats, error: e instanceof Error ? e.message : String(e) };
        }
      },
      async createInvoice(amountSats: number, memo?: string) {
        const res = await nwc.makeInvoice(amountSats * 1000, memo ?? `Top up ${amountSats} sats`);
        return res.invoice;
      },
      async disconnect() {
        /* handled by provider */
      },
    };
  }, [ndk, nwc]);

  const value = useMemo<WalletCtx>(
    () => ({ wallet, status, error, balance, connectNwc, disconnect, refreshBalance }),
    [wallet, status, error, balance, connectNwc, disconnect, refreshBalance],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWallet() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>');
  return ctx;
}
