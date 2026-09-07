/**
 * Restore AuraPay pay_periods.created_at onto Neon PayPeriod.createdAt
 * (migrate-elioay originally omitted createdAt → all rows got migration-time now()).
 *
 * Defaults to dry-run. Pass --execute to write.
 *
 * Env:
 *   DATABASE_URL (Neon) — from elio-deploy-env/pay.env
 *   OLD_ELIOPAY_TURSO_URL / OLD_ELIOPAY_TURSO_TOKEN — or falls back to aurapay/.env.local
 */
import { createClient } from "@libsql/client";
import { prisma } from "@elio/db";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

dotenv.config({ path: path.resolve(__dirname, ".env.local") });
dotenv.config({ path: path.resolve("D:/WEB DEV/Hish/elio-deploy-env/pay.env") });

const EXECUTE = process.argv.includes("--execute");

function readTursoFromAuraPayLocal(): { url: string; token: string } | null {
  const p = path.resolve("D:/WEB DEV/Hish/ElioPay/aurapay/.env.local");
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, "utf8");
  const url = raw.match(/TURSO_DATABASE_URL="([^"]+)"/)?.[1];
  const token = raw.match(/TURSO_AUTH_TOKEN="([^"]+)"/)?.[1];
  if (!url || !token) return null;
  return { url, token };
}

function parseCreatedAt(value: unknown): Date | null {
  if (value == null) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

async function main() {
  const fromEnvUrl = process.env.OLD_ELIOPAY_TURSO_URL;
  const fromEnvToken = process.env.OLD_ELIOPAY_TURSO_TOKEN;
  const fallback = readTursoFromAuraPayLocal();
  const url = fromEnvUrl || fallback?.url;
  const authToken = fromEnvToken || fallback?.token;
  if (!url || !authToken) {
    throw new Error("Set OLD_ELIOPAY_TURSO_URL/TOKEN or ensure aurapay/.env.local exists");
  }
  if (!process.env.DATABASE_URL && !process.env.DIRECT_DATABASE_URL) {
    throw new Error("DATABASE_URL not set (load elio-deploy-env/pay.env)");
  }
  process.env.DATABASE_URL = process.env.DATABASE_URL || process.env.DIRECT_DATABASE_URL!;

  const oldDb = createClient({ url, authToken });
  const practice = await prisma.practice.findFirst();
  if (!practice) throw new Error("No Practice in Neon");

  const oldPeriods = await oldDb.execute(
    "SELECT id, month, year, status, created_at FROM pay_periods ORDER BY year DESC, month DESC"
  );

  const neu = await prisma.payPeriod.findMany({
    where: { practiceId: practice.id },
    select: { id: true, periodStart: true, status: true, createdAt: true },
    orderBy: [{ periodStart: "desc" }, { createdAt: "asc" }],
  });

  type NeuRow = (typeof neu)[number];
  const byMonth = new Map<string, NeuRow[]>();
  for (const p of neu) {
    const month = p.periodStart.getUTCMonth() + 1;
    const year = p.periodStart.getUTCFullYear();
    const key = `${year}-${month}`;
    const list = byMonth.get(key) ?? [];
    list.push(p);
    byMonth.set(key, list);
  }

  let matched = 0;
  let updated = 0;
  let skippedSame = 0;
  let missing = 0;

  console.log(EXECUTE ? "EXECUTE mode" : "DRY RUN (pass --execute to write)");
  console.log(`Old periods: ${oldPeriods.rows.length}; Neon periods: ${neu.length}`);

  for (const row of oldPeriods.rows) {
    const month = Number(row.month);
    const year = Number(row.year);
    const key = `${year}-${month}`;
    const createdAt = parseCreatedAt(row.created_at);
    if (!createdAt) {
      console.warn(`skip ${key}: bad created_at=${row.created_at}`);
      continue;
    }

    const candidates = byMonth.get(key) ?? [];
    if (candidates.length === 0) {
      missing++;
      console.warn(`no Neon row for old ${key} (status=${row.status})`);
      continue;
    }

    // Prefer LOCKED match to old finalized, else oldest Neon row for that month.
    const wantLocked = String(row.status).toLowerCase() === "finalized";
    const target =
      (wantLocked ? candidates.find((c) => c.status === "LOCKED") : undefined) ??
      candidates.find((c) => c.status === "DRAFT") ??
      candidates[0]!;

    matched++;
    const same = Math.abs(target.createdAt.getTime() - createdAt.getTime()) < 1000;
    if (same) {
      skippedSame++;
      continue;
    }

    console.log(
      `${key}: ${target.createdAt.toISOString()} → ${createdAt.toISOString()} (${target.status} id=${target.id.slice(0, 8)}…)`
    );
    if (EXECUTE) {
      await prisma.payPeriod.update({
        where: { id: target.id },
        data: { createdAt },
      });
      updated++;
    } else {
      updated++;
    }
  }

  console.log(
    JSON.stringify({ matched, wouldOrDidUpdate: updated, skippedSame, missing, execute: EXECUTE }, null, 2)
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
