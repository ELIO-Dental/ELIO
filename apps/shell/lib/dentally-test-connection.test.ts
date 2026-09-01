import { describe, expect, it } from "vitest";
import { testDentallyApiKey } from "./dentally-test-connection";

describe("testDentallyApiKey", () => {
  it("rejects empty keys", async () => {
    expect(await testDentallyApiKey("")).toEqual({ ok: false, error: "Enter an API key to test." });
  });

  it("rejects very short keys", async () => {
    expect(await testDentallyApiKey("abc")).toEqual({ ok: false, error: "API key looks too short." });
  });

  it("returns ok when Dentally responds", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ patients: [] }), { status: 200, headers: { "Content-Type": "application/json" } });

    expect(await testDentallyApiKey("valid-test-key", fetchImpl as typeof fetch)).toEqual({ ok: true });
  });

  it("returns error when Dentally rejects the key", async () => {
    const fetchImpl = async () => new Response("Unauthorized", { status: 401 });

    const result = await testDentallyApiKey("invalid-test-key", fetchImpl as typeof fetch);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0);
    }
  });
});
