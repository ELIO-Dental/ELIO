/**
 * Step 2.1 (MASTER_BUILD_GUIDE.md §2.1, FR-5) — self-serve practice signup.
 * The platform's only unauthenticated, practice-CREATING endpoint — rate
 * limited at the route layer (see app/api/public/signup/route.ts), per the
 * guide's explicit instruction to build that in from day one, not bolt it on
 * after Step 2.4's security review finds its absence.
 *
 * Per Hisham's confirmed answer (00_SCOPE.md §12 item 6): each selected
 * module gets its OWN independent 7-day trial, never one whole-practice trial.
 */
import { prisma, Prisma, type ModuleId } from "@elio/db";
import bcrypt from "bcryptjs";
import { encryptSecret } from "@elio/auth";

const TRIAL_DAYS = 7;
const VALID_MODULES: ModuleId[] = ["PAY", "PLANS", "FLOW"];

export interface SignupInput {
  practiceName: string;
  adminEmail: string;
  adminPassword: string;
  dentallyApiKey?: string;
  selectedModules: ModuleId[];
}

export class SignupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignupValidationError";
  }
}

export interface SignupResult {
  practiceId: string;
  userId: string;
  licencedModules: ModuleId[];
}

export async function signUpPractice(input: SignupInput): Promise<SignupResult> {
  const practiceName = input.practiceName.trim();
  const email = input.adminEmail.toLowerCase().trim();

  if (practiceName.length < 2) {
    throw new SignupValidationError("Practice name must be at least 2 characters.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new SignupValidationError("Enter a valid email address.");
  }
  if (input.adminPassword.length < 10) {
    throw new SignupValidationError("Password must be at least 10 characters.");
  }
  const selectedModules = [...new Set(input.selectedModules)].filter((m) => VALID_MODULES.includes(m));
  if (selectedModules.length === 0) {
    throw new SignupValidationError("Select at least one module to trial.");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Same generic-failure principle as login (Testing 1.2) — never confirm
    // whether an email is already registered to a real reason vs. a typo.
    throw new SignupValidationError("Couldn't create your account with those details. Check the email and try again.");
  }

  const hashedPassword = await bcrypt.hash(input.adminPassword, 12);
  const encryptedDentallyKey = input.dentallyApiKey?.trim() ? encryptSecret(input.dentallyApiKey.trim()) : null;
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  let result: { practiceId: string; userId: string };
  try {
    result = await prisma.$transaction(async (tx) => {
      const practice = await tx.practice.create({
        data: {
          name: practiceName,
          dentallyApiKey: encryptedDentallyKey,
          dentallyConnectionStatus: encryptedDentallyKey ? "CONNECTED" : "NOT_CONNECTED",
          onboardingStatus: "IN_PROGRESS",
        },
      });

      const user = await tx.user.create({
        data: {
          email,
          hashedPassword,
          role: "OWNER",
          practiceId: practice.id,
          active: true,
        },
      });

      for (const moduleId of selectedModules) {
        await tx.licence.create({
          data: {
            practiceId: practice.id,
            moduleId,
            active: true,
            grantedAt: new Date(),
            trialEndsAt,
          },
        });
      }

      return { practiceId: practice.id, userId: user.id };
    });
  } catch (error) {
    // A concurrent signup for the exact same email can win the DB's real
    // unique constraint after both requests pass the pre-check above (a
    // genuine TOCTOU race) — must surface as the SAME generic 400 the
    // pre-check path returns, not a raw 500, or the race-losing request
    // becomes a distinguishable oracle for "this email already existed."
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new SignupValidationError("Couldn't create your account with those details. Check the email and try again.");
    }
    throw error;
  }

  return { ...result, licencedModules: selectedModules };
}
