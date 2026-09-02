/**
 * Wallet abstraction.
 *
 * 1btc custodies NOTHING. Every implementation of this interface delegates to a
 * wallet the user controls. NWC is the first backend; a guided third-party
 * custodial signup (Coinos / Alby, connected over NWC) and an in-app Cashu
 * (NIP-60) wallet are future backends that satisfy the same contract.
 *
 * Nothing in the app should import a concrete wallet class directly — go through
 * the WalletProvider context so backends stay swappable.
 */

export type WalletKind = 'nwc' | 'cashu' | 'webln' | 'none';

export interface WalletInfo {
  kind: WalletKind;
  /** Human label, e.g. "Alby", "Coinos", "Zeus". */
  label: string;
  /** Whether the backend can actively pay (send zaps) or only receive. */
  canSend: boolean;
}

export interface ZapTarget {
  /** hex pubkey of the recipient. */
  pubkey: string;
  /** event id, when zapping a specific note rather than a profile. */
  eventId?: string;
  /** the recipient's lud16 / lud06, resolved by the caller when known. */
  lnAddress?: string;
}

export interface ZapResult {
  ok: boolean;
  preimage?: string;
  amountSats: number;
  error?: string;
}

export interface Wallet {
  info: WalletInfo;
  /** sats, or null if the backend can't report a balance (receive-only / privacy). */
  getBalance(): Promise<number | null>;
  /** Pay a NIP-57 zap to a note or profile. Returns a receipt-ish result. */
  sendZap(target: ZapTarget, amountSats: number, comment?: string): Promise<ZapResult>;
  /** Create a BOLT11 invoice to receive `amountSats` (used for top-ups / the universal fallback). */
  createInvoice(amountSats: number, memo?: string): Promise<string>;
  /** Tear down connections. */
  disconnect(): Promise<void>;
}
