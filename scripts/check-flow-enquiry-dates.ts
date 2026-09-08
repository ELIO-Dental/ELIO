import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvFile(path: string, force = false) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (force || !process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(join(process.cwd(), "..", "elio-deploy-env", "shell.env"), true);
loadEnvFile(join(process.cwd(), "packages", "db", ".env"));
if (process.env.DIRECT_DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL.trim();
}

async function main() {
  const { prisma } = await import("@elio/db");
  const practiceId = "seed-practice";
  const oldest = await prisma.enquiry.findFirst({
    where: { practiceId },
    orderBy: { capturedAt: "asc" },
    select: { capturedAt: true, id: true },
  });
  const newest = await prisma.enquiry.findFirst({
    where: { practiceId },
    orderBy: { capturedAt: "desc" },
    select: { capturedAt: true, id: true },
  });
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 3);
  const in3m = await prisma.enquiry.count({
    where: { practiceId, capturedAt: { gte: cutoff } },
  });
  const total = await prisma.enquiry.count({ where: { practiceId } });
  console.log(JSON.stringify({ total, in3m, oldest, newest, cutoff }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
