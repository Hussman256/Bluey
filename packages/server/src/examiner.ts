import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { KIND } from '@bluey/shared';
import { SimplePool } from 'nostr-tools/pool';
import { finalizeEvent, generateSecretKey, getPublicKey, type Event } from 'nostr-tools/pure';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';
import { config } from './config.ts';

/**
 * The Bluey examiner: the identity that grades lesson quizzes and issues the
 * automatic completion badge (NIP-58) when a learner passes every quiz in a
 * bootcamp. Tutors aren't online to sign each award, so the index signs it.
 */
function load(): Uint8Array {
  // ephemeral hosts must pass the key in, or every restart creates a new issuer
  const fromEnv = process.env.EXAMINER_SECRET_KEY?.trim();
  if (fromEnv) return hexToBytes(fromEnv);
  try {
    return hexToBytes(readFileSync(config.examinerKeyPath, 'utf8').trim());
  } catch {
    mkdirSync(dirname(config.examinerKeyPath), { recursive: true });
    const sk = generateSecretKey();
    writeFileSync(config.examinerKeyPath, bytesToHex(sk), { mode: 0o600 });
    return sk;
  }
}

const sk = load();
export const examinerPubkey = getPublicKey(sk);

const pool = new SimplePool();

async function publish(ev: Event): Promise<void> {
  // one relay accepting it is enough; the rest catch up via other clients
  await Promise.any(pool.publish(config.relays, ev));
}

/** Badge `d` tag for a bootcamp's quiz completion. Ends in "-complete", like tutor-issued ones. */
export const completionBadgeD = (bootcampAddr: string) =>
  `bluey-${createHash('sha256').update(bootcampAddr).digest('hex').slice(0, 16)}-complete`;

/** Publish the badge definition (replaceable, so re-publishing is harmless) and award it. Returns the award id. */
export async function awardCompletion(bootcampAddr: string, bootcampTitle: string, learner: string) {
  const now = Math.floor(Date.now() / 1000);
  const d = completionBadgeD(bootcampAddr);
  const def = finalizeEvent(
    {
      kind: KIND.BadgeDefinition,
      created_at: now,
      content: '',
      tags: [
        ['d', d],
        // useVouched counts badges named "… — Completed" as finished bootcamps
        ['name', `${bootcampTitle} — Completed`],
        ['description', `Passed every lesson quiz in ${bootcampTitle} on Bluey.`],
        ['a', bootcampAddr],
      ],
    },
    sk,
  );
  const award = finalizeEvent(
    {
      kind: KIND.BadgeAward,
      created_at: now,
      content: '',
      tags: [
        ['a', `${KIND.BadgeDefinition}:${examinerPubkey}:${d}`],
        ['p', learner],
      ],
    },
    sk,
  );
  await publish(def);
  await publish(award);
  return award.id;
}
