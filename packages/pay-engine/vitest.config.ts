import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30000,
    coverage: {
      // F.3 Final QA (2026-08-29): index.ts is a pure re-export barrel (no
      // logic of its own), versioning-check.ts and run-compass-parse.ts are
      // documented manual verification scripts run via `npx tsx`, not part
      // of the automated suite or any real request path — none of the three
      // should count against 00_SCOPE.md NFR-1's "≥80% core coverage" bar,
      // which is about the actual pay-calculation logic (period.ts,
      // pay-calc.ts, compass-parser.ts — all 92-100% covered).
      exclude: ["src/index.ts", "src/versioning-check.ts", "src/run-compass-parse.ts", "test-fixtures/**"],
    },
  },
});
