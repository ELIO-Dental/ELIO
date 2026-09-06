/**
 * Client handoff: rename practice + set Portal OWNER + Super Admin credentials.
 * Removes any other users on seed-practice.
 *
 * Usage:
 *   DATABASE_URL=... CONFIRM_HANDOFF=1 npx tsx scripts/handoff-client-admins.ts
 */
import bcrypt from "bcryptjs";
import { prisma } from "@elio/db";

const PRACTICE_ID = "seed-practice";
const PRACTICE_NAME = "Aura Dental Clinic";

const OWNER_EMAIL = "drhish@auradentalclinic.co.uk";
const OWNER_PASSWORD = "Epsckayu1";

const SUPER_EMAIL = "hisham.saqib@outlook.com";
const SUPER_PASSWORD = "Epsckayu1";

async function upsertLogin(opts: {
  email: string;
  password: string;
  role: "OWNER" | "SUPER_ADMIN";
  replaceEmails: string[];
}) {
  const hashedPassword = await bcrypt.hash(opts.password, 12);
  const email = opts.email.toLowerCase();

  // Prefer updating an existing row if email already exists; else retarget a
  // known replace email; else create.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const user = await prisma.user.update({
      where: { email },
      data: {
        hashedPassword,
        role: opts.role,
        practiceId: PRACTICE_ID,
        active: true,
        // Fresh client handoff — clear MFA so they set it themselves if needed.
        mfaEnabled: false,
        mfaSecret: null,
      },
    });
    console.log(`  updated existing ${opts.role}: ${user.email}`);
    return user;
  }

  for (const oldEmail of opts.replaceEmails) {
    const old = await prisma.user.findUnique({ where: { email: oldEmail } });
    if (!old) continue;
    const user = await prisma.user.update({
      where: { email: oldEmail },
      data: {
        email,
        hashedPassword,
        role: opts.role,
        practiceId: PRACTICE_ID,
        active: true,
        mfaEnabled: false,
        mfaSecret: null,
      },
    });
    console.log(`  retargeted ${oldEmail} → ${user.email} (${opts.role})`);
    return user;
  }

  const user = await prisma.user.create({
    data: {
      email,
      hashedPassword,
      role: opts.role,
      practiceId: PRACTICE_ID,
      active: true,
    },
  });
  console.log(`  created ${opts.role}: ${user.email}`);
  return user;
}

async function main() {
  const apply = process.env.CONFIRM_HANDOFF === "1";
  console.log(apply ? "\n=== APPLY HANDOFF ===\n" : "\n=== DRY RUN ===\n");

  const practice = await prisma.practice.findUnique({
    where: { id: PRACTICE_ID },
    select: { id: true, name: true },
  });
  if (!practice) throw new Error(`Practice ${PRACTICE_ID} not found`);
  console.log(`Practice: "${practice.name}" → "${PRACTICE_NAME}"`);

  const before = await prisma.user.findMany({
    where: { practiceId: PRACTICE_ID },
    select: { email: true, role: true },
    orderBy: { email: "asc" },
  });
  console.log("Users before:", before.map((u) => `${u.email}/${u.role}`).join(", ") || "(none)");

  if (!apply) {
    console.log(`\nWould set OWNER=${OWNER_EMAIL}`);
    console.log(`Would set SUPER_ADMIN=${SUPER_EMAIL}`);
    console.log("Would delete any other users on this practice.");
    console.log("\nRe-run with CONFIRM_HANDOFF=1 to apply.");
    return;
  }

  await prisma.practice.update({
    where: { id: PRACTICE_ID },
    data: { name: PRACTICE_NAME },
  });
  console.log("✓ practice renamed");

  await upsertLogin({
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    role: "OWNER",
    replaceEmails: ["mi0364922@gmail.com", "dev-owner@elio.test"],
  });

  await upsertLogin({
    email: SUPER_EMAIL,
    password: SUPER_PASSWORD,
    role: "SUPER_ADMIN",
    replaceEmails: ["seed.superadmin@elio.dev"],
  });

  const keep = [OWNER_EMAIL.toLowerCase(), SUPER_EMAIL.toLowerCase()];
  const extras = await prisma.user.findMany({
    where: {
      practiceId: PRACTICE_ID,
      email: { notIn: keep },
    },
    select: { id: true, email: true, role: true },
  });
  if (extras.length) {
    const ids = extras.map((u) => u.id);
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.planPatientNote.updateMany({
      where: { authorId: { in: ids } },
      data: { authorId: null },
    });
    await prisma.planEmailLog.updateMany({
      where: { sentById: { in: ids } },
      data: { sentById: null },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    console.log(
      "✓ removed extras:",
      extras.map((u) => u.email).join(", ")
    );
  } else {
    console.log("✓ no extra team members");
  }

  // Verify password hashes round-trip
  for (const [email, password, role] of [
    [OWNER_EMAIL, OWNER_PASSWORD, "OWNER"],
    [SUPER_EMAIL, SUPER_PASSWORD, "SUPER_ADMIN"],
  ] as const) {
    const u = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!u) throw new Error(`Missing ${role} ${email}`);
    const ok = await bcrypt.compare(password, u.hashedPassword);
    if (!ok) throw new Error(`Password verify failed for ${email}`);
    if (u.role !== role) throw new Error(`Role mismatch for ${email}: ${u.role}`);
    if (u.practiceId !== PRACTICE_ID) throw new Error(`Practice mismatch for ${email}`);
    console.log(`✓ login ok ${role}: ${u.email}`);
  }

  const after = await prisma.user.findMany({
    where: { practiceId: PRACTICE_ID },
    select: { email: true, role: true, active: true },
    orderBy: { email: "asc" },
  });
  const renamed = await prisma.practice.findUnique({
    where: { id: PRACTICE_ID },
    select: { name: true },
  });
  console.log("\nPractice name:", renamed?.name);
  console.log(
    "Users after:",
    after.map((u) => `${u.email}/${u.role}`).join(", ")
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
