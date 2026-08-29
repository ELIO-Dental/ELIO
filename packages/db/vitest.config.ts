import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 30000,
    coverage: {
      // F.3 Final QA (2026-08-29): index.ts is a pure re-export barrel,
      // seed.ts is the dev-seed script (run via `npm run seed`, not part of
      // any automated suite), gc_sandbox_test.ts is a standalone manual
      // GoCardless-sandbox debug script from an earlier session (never
      // referenced by any test or app code — confirmed via git history:
      // untouched since the initial commit). None represents a real gap
      // against 00_SCOPE.md NFR-1's "≥80% core coverage" bar, which is
      // about tenant.ts (the actual security-critical scoping logic).
      exclude: ["index.ts", "seed.ts", "gc_sandbox_test.ts", "check-*.mjs"],
    },
  },
});
