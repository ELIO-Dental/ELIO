/**
 * Backfill pay_dentists.isNhs / active / rates / IDs from AuraPay Turso.
 * Usage: node scripts/backfill-dentist-aurapay-flags.cjs
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@libsql/client");
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

function norm(n) {
  return String(n || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function main() {
  const aura = loadEnv(
    path.join(__dirname, "../../../../ElioPay/aurapay/.env.local")
  );
  const dbEnv = loadEnv(path.join(__dirname, "../.env"));
  for (const [k, v] of Object.entries(dbEnv)) {
    if (!process.env[k]) process.env[k] = v;
  }
  if (!aura.TURSO_DATABASE_URL || !aura.TURSO_AUTH_TOKEN) {
    throw new Error("Turso credentials missing in ElioPay/aurapay/.env.local");
  }

  const turso = createClient({
    url: aura.TURSO_DATABASE_URL,
    authToken: aura.TURSO_AUTH_TOKEN,
  });
  const rs = await turso.execute("SELECT * FROM dentists");
  const byName = new Map();
  for (const r of rs.rows) {
    const obj = Object.fromEntries(
      Object.keys(r)
        .filter((k) => Number.isNaN(Number(k)))
        .map((k) => [k, r[k]])
    );
    byName.set(norm(obj.name), obj);
  }

  const prisma = new PrismaClient();
  const dentists = await prisma.dentist.findMany();
  let updated = 0;
  for (const d of dentists) {
    const t = byName.get(norm(d.name));
    if (!t) continue;
    const data = {
      isNhs: Number(t.is_nhs) === 1,
      active: t.active == null ? true : Number(t.active) === 1,
      udaRatePence:
        t.uda_rate != null ? Math.round(Number(t.uda_rate) * 100) : d.udaRatePence,
      privateSplitPercent:
        t.split_percentage != null ? Number(t.split_percentage) : d.privateSplitPercent,
      email: t.email ? String(t.email) : d.email,
      nhsPerformerNumber: t.performer_number
        ? String(t.performer_number)
        : d.nhsPerformerNumber,
      dentallyPractitionerId: t.practitioner_id
        ? String(t.practitioner_id)
        : d.dentallyPractitionerId,
    };
    await prisma.dentist.update({ where: { id: d.id }, data });
    updated++;
    console.log(
      `${d.name}: isNhs=${data.isNhs} active=${data.active} uda=${data.udaRatePence}`
    );
  }
  console.log(`Updated ${updated} dentists from Turso`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
