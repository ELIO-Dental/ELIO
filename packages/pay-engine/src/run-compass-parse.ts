// Manual verification script — run with `npx tsx src/run-compass-parse.ts` from packages/pay-engine.
// Not part of the automated test suite; prints real extracted figures from the real fixture
// for Step 1.6 verification evidence.
import { readFileSync } from "fs";
import { join } from "path";
import { parseCompassStatement } from "./compass-parser";

async function main() {
  const buf = readFileSync(join(__dirname, "..", "test-fixtures", "JuneJuly Compass Statement.pdf"));
  const result = await parseCompassStatement(buf);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
