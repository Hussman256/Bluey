import { NDKEvent, NDKUser, NDKZapper } from '@nostr-dev-kit/ndk';
import { NDKNWCWallet } from '@nostr-dev-kit/wallet';
import { useNDK } from '@nostr-dev-kit/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { LS } from '../nostr/config';
import type { Wallet, ZapResult, ZapTarget } from './types';

interface WalletCtx {
  wallet: Wallet | null;
  /** connection lifecycle */
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  error: string | null;
  balance: number | null;
  connectNwc: (uri: string) => Promise<void>;
  disconnect: () => Promise<void>;
  refreshBalance: () => Promise<void>;
}

const Ctx = createContext<WalletCtx | null>(null);

/** Wrap an NDKNWCWallet in our backend-agnostic Wallet interface. */
function nwcAdapter(ndk: NonNullable<ReturnType<typeof useNDK>['ndk']>, nwc: NDKNWCWallet): Wallet {
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
      // NWC make_invoice takes millisats
      const res = await nwc.makeInvoice(amountSats * 1000, memo ?? `Top up ${amountSats} sats`);
      return res.invoice;
    },
    async disconnect() {
      // NDKNWCWallet has no explicit teardown; drop the reference upstream.
    },
  };
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { ndk } = useNDK();
  const [status, setStatus] = useState<WalletCtx['status']>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const walletRef = useRef<Wallet | null>(null);
  const [walletVersion, setWalletVersion] = useState(0);

  const connectNwc = useCallback(
    async (uri: string) => {
      if (!ndk) return;
      setStatus('connecting');
      setError(null);
      try {
        const nwc = new NDKNWCWallet(ndk, { pairingCode: uri.trim(), timeout: 20_000 });
        await nwc.getInfo();
        ndk.wallet = nwc;
        walletRef.current = nwcAdapter(ndk, nwc);
        localStorage.setItem(LS.nwc, uri.trim());
        setStatus('connected');
        setWalletVersion((v) => v + 1);
        const b = await walletRef.current.getBalance();
        setBalance(b);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not reach that wallet');
        setStatus('error');
        walletRef.current = null;
      }
    },
    [ndk],
  );

  const disconnect = useCallback(async () => {
    await walletRef.current?.disconnect();
    walletRef.current = null;
    if (ndk) ndk.wallet = undefined;
    localStorage.removeItem(LS.nwc);
    setBalance(null);
    setStatus('disconnected');
    setWalletVersion((v) => v + 1);
  }, [ndk]);

  const refreshBalance = useCallback(async () => {
    const b = await walletRef.current?.getBalance();
    setBalance(b ?? null);
  }, []);

  // auto-reconnect a previously paired wallet
  useEffect(() => {
    if (!ndk || walletRef.current) return;
    const saved = localStorage.getItem(LS.nwc);
    if (saved) void connectNwc(saved);
  }, [ndk, connectNwc]);

  const value = useMemo<WalletCtx>(
    () => ({
      wallet: walletRef.current,
      status,
      error,
      balance,
      connectNwc,
      disconnect,
      refreshBalance,
    }),
    // walletVersion forces recompute when walletRef swaps
    [status, error, balance, connectNwc, disconnect, refreshBalance, walletVersion],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>');
  return ctx;
}
