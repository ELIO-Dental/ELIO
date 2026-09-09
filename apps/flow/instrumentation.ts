export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    const { setDentallyPostSyncHook, importCosmeticConsultsFromDentally } = await import("@elio/dentally");
    // Same hook as shell — inline Flow full-sync (after()) must import consults too.
    setDentallyPostSyncHook((practiceId) => importCosmeticConsultsFromDentally(practiceId));
  }
}
