/**
 * Dentally regression pack — unit suites + live smoke scripts (seed-practice).
 *
 * Usage (from elio/):
 *   npx tsx scripts/regression-dentally.ts
 *   npx tsx scripts/regression-dentally.ts --smoke
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const SMOKE = process.argv.includes("--smoke");

function run(label: string, command: string, args: string[], cwd = ROOT) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, NODE_OPTIONS: "--dns-result-order=ipv4first" },
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit ${result.status}`);
  }
}

async function main() {
  run("@elio/dentally unit", "npm", ["run", "test", "--workspace=@elio/dentally", "--", "--reporter=dot"]);
  run("pay dentally unit", "npm", [
    "run",
    "test:unit",
    "--workspace=pay",
    "--",
    "--reporter=dot",
    "lib/dentally",
    "lib/line-source",
    "lib/month-pipeline",
  ]);
  run("flow unit", "npm", ["run", "test:unit", "--workspace=flow", "--", "--reporter=dot"]);

  if (SMOKE) {
    run(
      "verify pay period",
      "npx",
      ["tsx", "scripts/verify-pay-dentally-period.ts", "--periodId=cmtjywvu30003ul04urf4ro9w"]
    );
    run("flow import smoke", "npx", ["tsx", "scripts/smoke-flow-consult-import.ts", "--execute"]);
    run("plans sync smoke", "npx", ["tsx", "scripts/smoke-plans-dentally-sync.ts", "--execute"]);
  }

  console.log("\nREGRESSION OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
