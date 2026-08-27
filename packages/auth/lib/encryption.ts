// Step 2.1 — real encryption for a new self-serve practice's own Dentally API
// key (Practice.dentallyApiKey — the schema field's own comment has flagged
// "encrypted at rest, Phase 2" since Step 1.3, and this is that Phase 2 work).
// AES-256-GCM: authenticated encryption (tamper-evident, not just obscured).
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV, the GCM-recommended size.

/** Derives a stable 32-byte key from ENCRYPTION_KEY so any reasonable-length
 * secret string in the env var works, rather than requiring an exact 32-byte
 * value operators could easily get wrong. */
function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("ENCRYPTION_KEY is not set — required to store any per-practice secret (e.g. Dentally API key).");
  }
  return createHash("sha256").update(secret).digest();
}

/** Returns `iv:authTag:ciphertext`, all hex-encoded, as a single string safe
 * to store directly in a text column. */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptSecret(stored: string): string {
  const [ivHex, authTagHex, ciphertextHex] = stored.split(":");
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error("Malformed encrypted secret — expected iv:authTag:ciphertext.");
  }
  const key = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]);
  return plaintext.toString("utf8");
}
