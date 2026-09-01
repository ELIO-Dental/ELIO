import { describe, expect, it } from "vitest";
import { emailsMatch, findExistingPatient, normalizeEmail } from "./patient-matching";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Pete-Dryden@Hotmail.com ")).toBe("pete-dryden@hotmail.com");
  });

  it("returns null for empty input", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});

describe("emailsMatch", () => {
  it("matches case-insensitively", () => {
    expect(emailsMatch("A@b.com", "a@B.com")).toBe(true);
  });
});

describe("findExistingPatient", () => {
  const existing = [
    { id: "1", dentallyId: "100", email: "a@example.com" },
    { id: "2", dentallyId: null, email: "b@example.com" },
  ];

  it("prefers dentally id", () => {
    const result = findExistingPatient({ dentallyId: "100", email: "other@example.com" }, existing);
    expect(result.match?.id).toBe("1");
    expect(result.matchedBy).toBe("dentallyId");
  });

  it("falls back to normalised email", () => {
    const result = findExistingPatient({ dentallyId: "999", email: " B@example.com " }, existing);
    expect(result.match?.id).toBe("2");
    expect(result.matchedBy).toBe("email");
  });

  it("returns null when no match", () => {
    const result = findExistingPatient({ dentallyId: "999", email: "nobody@example.com" }, existing);
    expect(result.match).toBeNull();
    expect(result.matchedBy).toBeNull();
  });
});
