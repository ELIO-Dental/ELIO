/**
 * Sync client-facing dentist hygiene from AuraPay Turso → Elio:
 * - real NHS performer numbers (replace SEED-*)
 * - soft-delete Angelica
 * Default dry-run; pass --execute to write.
 */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@libsql/client");

const EXECUTE = process.argv.includes("--execute");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
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

const auraEnv = loadEnvFile(
  path.join(__dirname, "../../../../ElioPay/aurapay/.env.local")
);
const dbEnv = loadEnvFile(path.join(__dirname, "../.env"));
for (const [k, v] of Object.entries({ ...dbEnv })) {
  if (!process.env[k]) process.env[k] = v;
}

async function main() {
  if (!auraEnv.TURSO_DATABASE_URL || !auraEnv.TURSO_AUTH_TOKEN) {
    throw new Error("Turso credentials missing in ElioPay/aurapay/.env.local");
  }
  const turso = createClient({
    url: auraEnv.TURSO_DATABASE_URL,
    authToken: auraEnv.TURSO_AUTH_TOKEN,
  });

  // Discover dentist columns
  const cols = await turso.execute("PRAGMA table_info(dentists)");
  console.log(
    "Turso dentists columns:",
    cols.rows.map((r) => r.name).join(", ")
  );

  const rs = await turso.execute(
    "SELECT * FROM dentists ORDER BY name COLLATE NOCASE"
  );
  console.log(`\nTurso dentists (${rs.rows.length}):`);
  for (const r of rs.rows) {
    console.log(
      JSON.stringify(
        Object.fromEntries(
          Object.keys(r)
            .filter((k) => Number.isNaN(Number(k)))
            .map((k) => [k, r[k]])
        )
      )
    );
  }

  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  const practiceId = "seed-practice";
  const elioDentists = await prisma.dentist.findMany({
    where: { practiceId },
    orderBy: { name: "asc" },
  });
  console.log(`\nElio dentists (${elioDentists.length}):`);
  for (const d of elioDentists) {
    console.log(
      `- ${d.name} | nhs=${d.nhsPerformerNumber} | dentally=${d.dentallyPractitionerId} | active=?`
    );
  }

  // Map by normalized name
  function norm(n) {
    return String(n || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  const tursoByName = new Map();
  for (const r of rs.rows) {
    const obj = Object.fromEntries(
      Object.keys(r)
        .filter((k) => Number.isNaN(Number(k)))
        .map((k) => [k, r[k]])
    );
    tursoByName.set(norm(obj.name), obj);
  }

  const angelica = elioDentists.filter((d) =>
    /angelica/i.test(d.name)
  );

  const nhsUpdates = [];
  const emailUpdates = [];
  for (const d of elioDentists) {
    if (/angelica/i.test(d.name)) continue;
    if (/^uat /i.test(d.name) || /live test|verify test/i.test(d.name)) continue;
    const t = tursoByName.get(norm(d.name));
    if (!t) {
      console.log(`NO TURSO MATCH: ${d.name}`);
      continue;
    }
    const performer = t.performer_number || t.nhs_performer_number || null;
    const dentallyId = t.practitioner_id || t.dentally_user_id || null;
    const email = t.email || null;
    const needsNhs =
      !d.nhsPerformerNumber ||
      String(d.nhsPerformerNumber).startsWith("SEED-");
    if (performer && needsNhs) {
      nhsUpdates.push({
        id: d.id,
        name: d.name,
        from: d.nhsPerformerNumber,
        to: String(performer),
      });
    }
    if (email && (!d.email || d.email !== String(email))) {
      emailUpdates.push({
        id: d.id,
        name: d.name,
        from: d.email,
        to: String(email),
      });
    }
    if (
      dentallyId != null &&
      String(dentallyId).trim() !== "" &&
      (!d.dentallyPractitionerId ||
        d.dentallyPractitionerId !== String(dentallyId))
    ) {
      console.log(
        `DENTALLY ID drift ${d.name}: elio=${d.dentallyPractitionerId} turso=${dentallyId}`
      );
    }
  }

  console.log("\nAngelica rows to remove:", angelica.map((d) => d.name));
  console.log("NHS updates:", nhsUpdates);
  console.log("Email updates:", emailUpdates);

  if (!EXECUTE) {
    console.log("\nDry-run only. Re-run with --execute to apply.");
    await prisma.$disconnect();
    return;
  }

  for (const u of nhsUpdates) {
    await prisma.dentist.update({
      where: { id: u.id },
      data: { nhsPerformerNumber: u.to },
    });
    console.log(`Updated NHS ${u.name}: ${u.from} → ${u.to}`);
  }

  for (const u of emailUpdates) {
    await prisma.dentist.update({
      where: { id: u.id },
      data: { email: u.to },
    });
    console.log(`Updated email ${u.name}: ${u.from} → ${u.to}`);
  }

  for (const d of angelica) {
    // Soft approach: clear mapping + rename so she cannot be used in ops;
    // hard-delete only if no payslip dependency, else deactivate via name prefix.
    const payslips = await prisma.payslipEntry.count({ where: { dentistId: d.id } });
    if (payslips === 0) {
      await prisma.dentistRateHistory.deleteMany({ where: { dentistId: d.id } });
      await prisma.dentist.delete({ where: { id: d.id } });
      console.log(`Deleted Angelica row ${d.id}`);
    } else {
      await prisma.dentist.update({
        where: { id: d.id },
        data: {
          name: `[REMOVED] ${d.name}`,
          dentallyPractitionerId: null,
          nhsPerformerNumber: null,
          email: null,
        },
      });
      console.log(`Deactivated Angelica (has ${payslips} payslips): ${d.id}`);
    }
  }

  await prisma.$disconnect();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
