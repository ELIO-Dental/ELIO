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
//
// Found live (2026-08-29, Step 2.4 e2e build-out): a fresh random secret on
// every seed run meant no automated test could ever know the SUPER_ADMIN's
// TOTP secret to compute a valid code — apps/admin's MFA gate was completely
// untestable end-to-end. SEED_SUPER_ADMIN_MFA_SECRET (git-ignored .env.local
// only, same pattern as INITIAL_ADMIN_PASSWORD) lets a test suite seed with a
// KNOWN secret and generate real, valid codes with the same otpauth library
// the login route itself verifies against — falls back to a real random
// secret (today's behavior, unchanged) when unset.
function seedMfaSecret(): string {
  const override = process.env.SEED_SUPER_ADMIN_MFA_SECRET;
  if (override) return override;
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

// Found live (2026-08-28, independent Phase 1 audit): these fallbacks used
// to be a real personal email + plaintext password, permanently committed
// to git history — a genuine credential-hygiene risk regardless of whose
// account it was. process.env.INITIAL_ADMIN_EMAIL/INITIAL_ADMIN_PASSWORD
// (set in .env.local, git-ignored) is the real path for any real account;
// these fallbacks exist only so `npm run seed` works out of the box on a
// fresh local checkout with no .env.local at all — they must never be a
// real, reachable credential.
const OWNER_EMAIL = process.env.INITIAL_ADMIN_EMAIL ?? "dev-owner@elio.test";
const OWNER_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD ?? "Dev-Owner-Local-Seed-Only-Not-Real";
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

    // Step 2.3 — MFA for Super Admin: if SEED_SUPER_ADMIN_MFA_SECRET is set
    // (e2e or handoff with a known authenticator key), enroll immediately.
    // Otherwise leave MFA off so the operator completes setup in admin Settings
    // on first sign-in, then changes password there too.
    const isSuperAdmin = role === "SUPER_ADMIN";
    const mfaSecretOverride = process.env.SEED_SUPER_ADMIN_MFA_SECRET;
    const enrollMfaNow = isSuperAdmin && Boolean(mfaSecretOverride);
    const mfaSecret = enrollMfaNow ? mfaSecretOverride! : undefined;

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        hashedPassword,
        practiceId: practice.id,
        role,
        active: true,
        ...(isSuperAdmin
          ? enrollMfaNow
            ? { mfaEnabled: true, mfaSecret }
            : { mfaEnabled: false, mfaSecret: null }
          : {}),
      },
      create: {
        email,
        hashedPassword,
        role,
        practiceId: practice.id,
        ...(isSuperAdmin
          ? enrollMfaNow
            ? { mfaEnabled: true, mfaSecret }
            : { mfaEnabled: false, mfaSecret: null }
          : {}),
      },
    });

    console.log(`Seeded ${role} user ${user.email} (password: ${password})`);
    if (isSuperAdmin && enrollMfaNow && mfaSecret) {
      console.log(`  MFA enrolled — add this key to an authenticator app:`);
      console.log(`  ${seedMfaOtpAuthUrl(email, mfaSecret)}`);
      console.log(`  (raw secret for manual entry: ${mfaSecret})`);
    }
    if (isSuperAdmin && !enrollMfaNow) {
      console.log(`  MFA not set — sign in at admin, open Settings, and enroll an authenticator.`);
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
