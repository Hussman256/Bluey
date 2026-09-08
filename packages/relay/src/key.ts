import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { config } from './config.ts';

/** The relay's own identity. It signs the relay-generated 39000–39002 events. */
function load(): Uint8Array {
  // Hosts with an ephemeral filesystem (Render free, Fly without a volume, …)
  // must pass the key in as an env var so the relay identity survives restarts —
  // otherwise every restart regenerates it and orphans every existing club.
  const fromEnv = process.env.RELAY_SECRET_KEY?.trim();
  if (fromEnv) return hexToBytes(fromEnv);

  try {
    return hexToBytes(readFileSync(config.keyPath, 'utf8').trim());
  } catch {
    mkdirSync(dirname(config.keyPath), { recursive: true });
    const sk = generateSecretKey();
    writeFileSync(config.keyPath, bytesToHex(sk), { mode: 0o600 });
    return sk;
  }
}

export const relaySecretKey = load();
export const relayPubkey = getPublicKey(relaySecretKey);
