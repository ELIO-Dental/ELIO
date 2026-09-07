/**
 * Backfill pay_supplier_invoice_entries.supplierId from AuraPay-style name joins.
 * Migration stored supplier_name into description when supplierId was omitted.
 *
 * Usage: node scripts/backfill-supplier-invoice-ids.cjs
 */
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

function loadEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

function normName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const dbEnv = loadEnv(path.join(__dirname, "../.env"));
  for (const [k, v] of Object.entries(dbEnv)) {
    if (!process.env[k]) process.env[k] = v;
  }

  const prisma = new PrismaClient();
  const suppliers = await prisma.savedSupplier.findMany();
  const byName = new Map(suppliers.map((s) => [normName(s.name), s]));

  const orphans = await prisma.supplierInvoiceEntry.findMany({
    where: { supplierId: null },
  });

  let linked = 0;
  for (const inv of orphans) {
    const match = inv.description ? byName.get(normName(inv.description)) : null;
    if (!match) continue;
    await prisma.supplierInvoiceEntry.update({
      where: { id: inv.id },
      data: {
        supplierId: match.id,
        // Clear description if it was only the supplier name placeholder.
        description:
          normName(inv.description) === normName(match.name) ? null : inv.description,
      },
    });
    linked++;
    console.log(`Linked invoice ${inv.id} → ${match.name}`);
  }

  console.log(`Linked ${linked}/${orphans.length} orphan supplier invoices`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
