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
  const total = await prisma.consult.count({ where: { practiceId } });
  const withAppt = await prisma.consult.count({
    where: { practiceId, appointment: { isNot: null } },
  });
  const withApptStart = await prisma.consult.count({
    where: { practiceId, appointment: { startsAt: { not: null } } },
  });
  const oldestAppt = await prisma.appointment.findFirst({
    where: { practiceId, startsAt: { not: null } },
    orderBy: { startsAt: "asc" },
    select: { startsAt: true },
  });
  const newestAppt = await prisma.appointment.findFirst({
    where: { practiceId, startsAt: { not: null } },
    orderBy: { startsAt: "desc" },
    select: { startsAt: true },
  });
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 3);
  const apptIn3m = await prisma.consult.count({
    where: { practiceId, appointment: { startsAt: { gte: cutoff } } },
  });
  const practices = await prisma.practice.findMany({
    select: { id: true, name: true, _count: { select: { consults: true, users: true } } },
  });
  console.log(
    JSON.stringify(
      { total, withAppt, withApptStart, oldestAppt, newestAppt, cutoff, apptIn3m, practices },
      null,
      2
    )
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
