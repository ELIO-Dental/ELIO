import { DentallyClient } from "@elio/dentally/src/client";

export type DentallyTestResult = { ok: true } | { ok: false; error: string };

/** Validates format and optionally pings Dentally with a one-page patients request. */
export async function testDentallyApiKey(
  apiKey: string,
  fetchImpl?: typeof fetch
): Promise<DentallyTestResult> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter an API key to test." };
  }
  if (trimmed.length < 8) {
    return { ok: false, error: "API key looks too short." };
  }

  try {
    const client = new DentallyClient({ apiKey: trimmed, fetchImpl });
    await client.get("/patients", { per_page: 1, page: 1 });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed.";
    return { ok: false, error: message };
  }
}
