import NDK, { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import { getKeyBackup, putKeyBackup } from './accountApi';
import { LS } from './config';

/**
 * Passkey accounts.
 *
 * A passkey can't sign Nostr events (different curve), so it guards the Nostr
 * key instead: the WebAuthn PRF extension gives a secret that only this passkey
 * can reproduce; we derive an AES-GCM key from it and encrypt the Nostr key.
 * The encrypted blob is kept on this device and backed up to the index service
 * (which can't read it), so the synced passkey can restore the account on a new
 * device.
 */

const PRF_SALT = new TextEncoder().encode('bluey/nostr-key/v1');

interface Stored {
  credentialId: string;
  pubkey: string;
  blob: string;
}

export class PasskeyUnsupportedError extends Error {
  constructor() {
    super("This device's passkeys can't protect a key yet. Use a recovery key instead.");
  }
}

export const passkeysAvailable = () =>
  typeof window !== 'undefined' && window.isSecureContext && 'PublicKeyCredential' in window;

const b64url = (b: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

async function wrapKey(prf: BufferSource) {
  const base = await crypto.subtle.importKey('raw', prf, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode('bluey key wrap v1') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encrypt(prf: BufferSource, secretHex: string): Promise<string> {
  const iv = random(12);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await wrapKey(prf),
    new TextEncoder().encode(secretHex),
  );
  return `v1.${b64url(iv)}.${b64url(ct)}`;
}

async function decrypt(prf: BufferSource, blob: string): Promise<string> {
  const [v, iv, ct] = blob.split('.');
  if (v !== 'v1' || !iv || !ct) throw new Error('Unrecognised key backup');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(iv) }, await wrapKey(prf), fromB64url(ct));
  return new TextDecoder().decode(pt);
}

function loadStored(): Stored[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LS.passkeys) ?? '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
function saveStored(s: Stored) {
  const rest = loadStored().filter((x) => x.credentialId !== s.credentialId);
  localStorage.setItem(LS.passkeys, JSON.stringify([s, ...rest].slice(0, 5)));
}

/** Ask the passkey for its PRF secret; with no credential id the user picks one. */
async function evalPrf(credentialId?: BufferSource) {
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: random(32),
      rpId: location.hostname,
      userVerification: 'required',
      allowCredentials: credentialId ? [{ type: 'public-key', id: credentialId }] : [],
      extensions: { prf: { eval: { first: PRF_SALT } } },
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('No passkey was chosen');
  const prf = cred.getClientExtensionResults().prf?.results?.first;
  if (!prf) throw new PasskeyUnsupportedError();
  return { credentialId: b64url(cred.rawId), prf };
}

/**
 * Create a new Nostr account protected by a new passkey. Returns the signer and
 * whether the encrypted backup reached the index (needed to sign in elsewhere).
 */
export async function createPasskeyAccount(ndk: NDK, label = 'Bluey account') {
  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Bluey', id: location.hostname },
      user: { id: random(16), name: label, displayName: label },
      challenge: random(32),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
      extensions: { prf: { eval: { first: PRF_SALT } } },
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('Passkey was not created');

  const ext = cred.getClientExtensionResults().prf;
  if (ext?.enabled === false) throw new PasskeyUnsupportedError();
  // some platforms only hand out the PRF secret on a sign-in, not at creation
  const prf = ext?.results?.first ?? (await evalPrf(cred.rawId)).prf;

  const signer = NDKPrivateKeySigner.generate();
  const credentialId = b64url(cred.rawId);
  const blob = await encrypt(prf, signer.privateKey);
  saveStored({ credentialId, pubkey: signer.pubkey, blob });

  let backedUp = true;
  try {
    await putKeyBackup(ndk, signer, credentialId, blob);
  } catch {
    backedUp = false;
  }
  return { signer, backedUp };
}

/** This device has a passkey that unlocks `pubkey`. */
export const hasPasskeyFor = (pubkey: string) => loadStored().some((s) => s.pubkey === pubkey);

/**
 * Upload this device's encrypted backups for `signer` (idempotent). Returns
 * false if none could be saved, e.g. the index is offline.
 */
export async function syncPasskeyBackups(ndk: NDK, signer: NDKPrivateKeySigner): Promise<boolean> {
  const mine = loadStored().filter((s) => s.pubkey === signer.pubkey);
  if (mine.length === 0) return false;
  const results = await Promise.allSettled(
    mine.map((s) => putKeyBackup(ndk, signer, s.credentialId, s.blob)),
  );
  return results.some((r) => r.status === 'fulfilled');
}

/** Sign in with any Bluey passkey on this device or synced to it. */
export async function signInWithPasskey(): Promise<NDKPrivateKeySigner> {
  const { credentialId, prf } = await evalPrf();
  let stored = loadStored().find((s) => s.credentialId === credentialId);
  if (!stored) {
    try {
      const remote = await getKeyBackup(credentialId);
      stored = { credentialId, ...remote };
    } catch (e) {
      const status = (e as { status?: number }).status;
      throw new Error(
        status === 404
          ? "This passkey isn't linked to a Bluey account."
          : "Couldn't reach Bluey to restore your account. Check your connection and try again.",
      );
    }
  }
  const signer = new NDKPrivateKeySigner(await decrypt(prf, stored.blob));
  if (signer.pubkey !== stored.pubkey) throw new Error('This passkey unlocked the wrong key');
  saveStored(stored);
  return signer;
}

/** Friendly text for WebAuthn errors (cancelled prompt, timeouts, wrong device). */
export function passkeyErrorMessage(e: unknown): string {
  if (e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'AbortError')) {
    return 'The passkey prompt was closed. Try again when you are ready.';
  }
  if (e instanceof DOMException && e.name === 'InvalidStateError') {
    return 'This device already has a Bluey passkey. Sign in with it instead.';
  }
  return e instanceof Error ? e.message : 'Something went wrong with the passkey';
}
