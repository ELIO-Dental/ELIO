import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@elio/db", () => ({
  prisma: {
    practice: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@elio/auth", () => ({
  decryptSecret: vi.fn((stored: string) => `decrypted:${stored}`),
}));

import { prisma } from "@elio/db";
import { decryptSecret } from "@elio/auth";
import {
  DentallySyncConfigError,
  getDentallyClientForPractice,
  resolvePracticeDentallyApiKey,
} from "./resolve-api-key";
import { DentallyClient } from "./client";

const findUnique = prisma.practice.findUnique as ReturnType<typeof vi.fn>;

describe("resolvePracticeDentallyApiKey", () => {
  const originalEnvKey = process.env.DENTALLY_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DENTALLY_API_KEY;
  });

  afterEach(() => {
    if (originalEnvKey === undefined) {
      delete process.env.DENTALLY_API_KEY;
    } else {
      process.env.DENTALLY_API_KEY = originalEnvKey;
    }
  });

  it("returns decrypted practice key when dentallyApiKey is set", async () => {
    findUnique.mockResolvedValue({ dentallyApiKey: "enc:stored" });

    const key = await resolvePracticeDentallyApiKey("practice-1");

    expect(key).toBe("decrypted:enc:stored");
    expect(decryptSecret).toHaveBeenCalledWith("enc:stored");
  });

  it("falls back to DENTALLY_API_KEY env when practice has no key", async () => {
    findUnique.mockResolvedValue({ dentallyApiKey: null });
    process.env.DENTALLY_API_KEY = "env-fallback-key";

    const key = await resolvePracticeDentallyApiKey("practice-1");

    expect(key).toBe("env-fallback-key");
    expect(decryptSecret).not.toHaveBeenCalled();
  });

  it("throws when practice is missing", async () => {
    findUnique.mockResolvedValue(null);

    await expect(resolvePracticeDentallyApiKey("missing")).rejects.toBeInstanceOf(DentallySyncConfigError);
  });

  it("throws when no practice key and no env fallback", async () => {
    findUnique.mockResolvedValue({ dentallyApiKey: null });

    await expect(resolvePracticeDentallyApiKey("practice-1")).rejects.toThrow(/No Dentally API key/);
  });

  it("throws when decryption fails", async () => {
    findUnique.mockResolvedValue({ dentallyApiKey: "bad" });
    vi.mocked(decryptSecret).mockImplementationOnce(() => {
      throw new Error("bad ciphertext");
    });

    await expect(resolvePracticeDentallyApiKey("practice-1")).rejects.toThrow(/Failed to decrypt/);
  });
});

describe("getDentallyClientForPractice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DENTALLY_API_KEY = "env-key";
  });

  it("returns a DentallyClient using the resolved key", async () => {
    findUnique.mockResolvedValue({ dentallyApiKey: null });

    const client = await getDentallyClientForPractice("practice-1");

    expect(client).toBeInstanceOf(DentallyClient);
  });
});
