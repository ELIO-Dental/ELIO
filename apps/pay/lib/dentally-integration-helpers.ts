/** Pure helpers for Dentally integration status (Y3.7 tests). */
export function isDentallyKeyConfigured(opts: {
  hasPracticeKey: boolean;
  envApiKey?: string | null;
  envApiToken?: string | null;
}): boolean {
  return Boolean(
    opts.hasPracticeKey || opts.envApiKey?.trim() || opts.envApiToken?.trim()
  );
}
