// Resolves which Dentally API key to use for a given practice (Phase A.1).
// Priority: Practice.dentallyApiKey (encrypted at rest) → DENTALLY_API_KEY env (dev fallback).
//
// Legacy reference:
// - ElioPlans/src/lib/dentally-sync.ts — read key from DB settings
// - ElioPay/aurapay/src/app/api/dentally/route.ts — DENTALLY_API_TOKEN per clinic

import { prisma } from "@elio/db";
import { decryptSecret } from "@elio/auth";
import { DentallyClient } from "./client";

export class DentallySyncConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DentallySyncConfigError";
  }
}

/**
 * Returns the plaintext Dentally API key for `practiceId`.
 * Throws DentallySyncConfigError when no key is available or decryption fails.
 */
export async function resolvePracticeDentallyApiKey(practiceId: string): Promise<string> {
  const practice = await prisma.practice.findUnique({
    where: { id: practiceId },
    select: { dentallyApiKey: true },
  });

  if (!practice) {
    throw new DentallySyncConfigError(`Practice not found: ${practiceId}`);
  }

  if (practice.dentallyApiKey?.trim()) {
    try {
      return decryptSecret(practice.dentallyApiKey);
    } catch {
      throw new DentallySyncConfigError(
        `Failed to decrypt Dentally API key for practice ${practiceId}. Verify ENCRYPTION_KEY matches the key used when the secret was stored.`
      );
    }
  }

  // Y1.3 — AuraPay used DENTALLY_API_TOKEN; accept that alias for deploy parity.
  const envKey =
    process.env.DENTALLY_API_KEY?.trim() || process.env.DENTALLY_API_TOKEN?.trim();
  if (envKey) {
    return envKey;
  }

  throw new DentallySyncConfigError(
    `No Dentally API key for practice ${practiceId}. Add a key in Settings → Integrations or set DENTALLY_API_KEY (or DENTALLY_API_TOKEN) for local development.`
  );
}

/** Builds a DentallyClient scoped to one practice's API key. */
export async function getDentallyClientForPractice(practiceId: string): Promise<DentallyClient> {
  const apiKey = await resolvePracticeDentallyApiKey(practiceId);
  return new DentallyClient({ apiKey });
}
