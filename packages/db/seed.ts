// Dev seed: the founder's own Practice + one seeded test user per role
// (SUPER_ADMIN, OWNER, ADMIN, FINANCE, STAFF, AUDITOR) — NFR-4's "seeded test
// accounts for every role," filled in fully by Step 1.5 per
// project-docs/PERMISSIONS_MATRIX.md's role list. Run via `npm run seed`.
import bcrypt from "bcryptjs";
import { Secret, TOTP } from "otpauth";
import { prisma } from "./client";
import type { ModuleId, Role } from "@prisma/client";

// Mirrors packages/auth/lib/mfa.ts's generateMfaSecret()/mfaOtpAuthUrl()
// exactly (same otpauth config: SHA1, 6 digits, 30s period) rather than
// importing across package boundaries — packages/auth already depends on
// @elio/db (for prisma), so importing packages/auth from here would create a
// real circular workspace dependency. `otpauth` is a tiny, stable library;
// duplicating this ~10-line config is safer than that circular edge.
function seedMfaSecret(): string {
  return new Secret({ size: 20 }).base32;
}
function seedMfaOtpAuthUrl(email: string, secret: string): string {
  return new TOTP({ issuer: "ELIO", label: email, algorithm: "SHA1", digits: 6, period: 30, secret: Secret.fromBase32(secret) }).toString();
}

// Step 2.2 (FR-3) added server-side licence gating to every module route — a
// practice with zero Licence rows is now locked out of everything. The
// founder's own seeded practice must never hit that, so seed it with real,
// permanent (no trialEndsAt) licences for all 3 built modules, same as the
// real backfill this session ran for the practice that already existed
// before this concept did (scripts/migrations/backfill-legacy-licences.ts).
const SEED_MODULES: ModuleId[] = ["PAY", "PLANS", "FLOW"];

const OWNER_EMAIL = process.env.INITIAL_ADMIN_EMAIL ?? "mi0364922@gmail.com";
const OWNER_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD ?? "ismaeel786";
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "Seed12345!";

// One seeded login per role. SUPER_ADMIN is platform-wide (apps/admin,
// Phase 2) but still needs a practice-scoped row today since User.practiceId
// is required by the current schema — apps/admin's own login path (Step 2.3)
// is what will actually gate SUPER_ADMIN access, not practice membership.
const SEED_ROLE_USERS: { role: Role; email: string }[] = [
  { role: "SUPER_ADMIN", email: "seed.superadmin@elio.dev" },
  { role: "OWNER", email: OWNER_EMAIL },
  { role: "ADMIN", email: "seed.admin@elio.dev" },
  { role: "FINANCE", email: "seed.finance@elio.dev" },
  { role: "STAFF", email: "seed.staff@elio.dev" },
  { role: "AUDITOR", email: "seed.auditor@elio.dev" },
];

async function main() {
  const practice = await prisma.practice.upsert({
    where: { id: "seed-practice" },
    update: {},
    create: {
      id: "seed-practice",
      name: "Founder's Practice",
      onboardingStatus: "COMPLETE",
      plan: "Internal",
    },
  });

  for (const { role, email } of SEED_ROLE_USERS) {
    const password = role === "OWNER" ? OWNER_PASSWORD : SEED_PASSWORD;
    const hashedPassword = await bcrypt.hash(password, 12);

    // Step 2.3 — MFA is MANDATORY for SUPER_ADMIN (apps/admin), unlike every
    // other role's opt-in-by-default. No self-serve MFA enrollment UI exists
    // anywhere in the codebase yet (a real, pre-existing gap, not new to this
    // step) — so the seeded SUPER_ADMIN's secret is generated here and its
    // otpauth:// URL printed for the operator to add to an authenticator app,
    // the same "real credential, printed once, note it down" pattern
    // INITIAL_ADMIN_PASSWORD already uses.
    const isSuperAdmin = role === "SUPER_ADMIN";
    const mfaSecret = isSuperAdmin ? seedMfaSecret() : undefined;

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        hashedPassword,
        practiceId: practice.id,
        role,
        active: true,
        ...(isSuperAdmin ? { mfaEnabled: true, mfaSecret } : {}),
      },
      create: {
        email,
        hashedPassword,
        role,
        practiceId: practice.id,
        ...(isSuperAdmin ? { mfaEnabled: true, mfaSecret } : {}),
      },
    });

    console.log(`Seeded ${role} user ${user.email} (password: ${password})`);
    if (isSuperAdmin && mfaSecret) {
      console.log(`  MFA is mandatory for this account — add it to an authenticator app:`);
      console.log(`  ${seedMfaOtpAuthUrl(email, mfaSecret)}`);
      console.log(`  (raw secret, if scanning a URL isn't convenient: ${mfaSecret})`);
    }
  }

  for (const moduleId of SEED_MODULES) {
    await prisma.licence.upsert({
      where: { practiceId_moduleId: { practiceId: practice.id, moduleId } },
      update: {},
      create: { practiceId: practice.id, moduleId, active: true, grantedAt: new Date(), trialEndsAt: null },
    });
  }

  console.log(`Seeded practice "${practice.name}" (${practice.id}) with all 6 role accounts and licences for ${SEED_MODULES.join(", ")}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
