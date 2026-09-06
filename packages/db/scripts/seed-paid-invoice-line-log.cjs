#!/usr/bin/env node
/**
 * Step 14 B — seed PaidInvoiceLineLog from historical private revenue lines.
 * Default: dry-run report only. Pass --execute to write.
 *
 * Only LOCKED periods with dentallyInvoiceId (no amount orphans).
 *
 * Usage:
 *   node packages/db/scripts/seed-paid-invoice-line-log.cjs [--practiceId=...] [--execute]
 */

const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  const key = m[1];
  let val = m[2].trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = val;
}

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function resolveIdentity(line) {
  const inv = (line.dentallyInvoiceId || "").trim();
  if (!inv) return null;
  return { invoiceId: inv, lineKey: `amt:${line.amountPence}` };
}

function composite(invoiceId, lineKey) {
  return `${invoiceId}::${lineKey}`;
}

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const practiceArg = args.find((a) => a.startsWith("--practiceId="));
  const practiceIdFilter = practiceArg ? practiceArg.split("=")[1] : null;

  const payslips = await prisma.payslipEntry.findMany({
    where: practiceIdFilter ? { practiceId: practiceIdFilter } : undefined,
    include: {
      privateRevenueLineItems: true,
      payPeriod: { select: { id: true, status: true } },
    },
  });

  const candidates = [];
  let skippedDraft = 0;
  let skippedNoInvoiceId = 0;
  let skippedUnpaid = 0;

  for (const p of payslips) {
    if (p.payPeriod?.status !== "LOCKED") {
      skippedDraft += p.privateRevenueLineItems.length;
      continue;
    }
    for (const li of p.privateRevenueLineItems) {
      const status = (li.paymentStatus || "paid").toLowerCase();
      if (li.flagged || status === "unpaid" || status === "partial") {
        skippedUnpaid++;
        continue;
      }
      if ((li.amountOutstandingPence || 0) > 0) {
        skippedUnpaid++;
        continue;
      }
      const id = resolveIdentity(li);
      if (!id) {
        skippedNoInvoiceId++;
        continue;
      }
      candidates.push({
        practiceId: p.practiceId,
        invoiceId: id.invoiceId,
        lineKey: id.lineKey,
        dentistId: p.dentistId,
        payPeriodId: p.payPeriodId,
        amountPence: li.amountPence,
      });
    }
  }

  const existing = await prisma.paidInvoiceLineLog.findMany({
    select: { practiceId: true, invoiceId: true, lineKey: true },
  });
  const existingKeys = new Set(
    existing.map((e) => `${e.practiceId}::${composite(e.invoiceId, e.lineKey)}`)
  );

  const seen = new Set();
  const toInsert = [];
  let skipExisting = 0;
  let dupBatch = 0;
  for (const c of candidates) {
    const key = `${c.practiceId}::${composite(c.invoiceId, c.lineKey)}`;
    if (existingKeys.has(key)) {
      skipExisting++;
      continue;
    }
    if (seen.has(key)) {
      dupBatch++;
      continue;
    }
    seen.add(key);
    toInsert.push(c);
  }

  console.log(
    JSON.stringify(
      {
        mode: execute ? "EXECUTE" : "DRY_RUN",
        candidates: candidates.length,
        wouldInsert: toInsert.length,
        wouldSkipExisting: skipExisting,
        duplicatesInBatch: dupBatch,
        skippedDraft,
        skippedNoInvoiceId,
        skippedUnpaid,
        sample: toInsert.slice(0, 15),
      },
      null,
      2
    )
  );

  if (!execute) {
    console.log("\nDry-run only. Re-run with --execute to write.");
    return;
  }

  let written = 0;
  for (const c of toInsert) {
    await prisma.paidInvoiceLineLog.create({
      data: {
        practiceId: c.practiceId,
        invoiceId: c.invoiceId,
        lineKey: c.lineKey,
        dentistId: c.dentistId,
        payPeriodId: c.payPeriodId,
        amountPence: c.amountPence,
      },
    });
    written++;
  }
  console.log(`Wrote ${written} PaidInvoiceLineLog row(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
