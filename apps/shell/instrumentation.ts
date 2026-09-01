export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    const { setDentallyPostSyncHook, importCosmeticConsultsFromDentally } = await import("@elio/dentally");
    setDentallyPostSyncHook((practiceId) => importCosmeticConsultsFromDentally(practiceId));
  }
}
