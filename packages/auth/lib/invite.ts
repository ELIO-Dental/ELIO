// Invite-a-user flow — Step 1.5 (Team screen). Reuses Step 1.2's password-reset
// email/token pattern (no separate Invite model — a fresh User row is created
// with a random unusable password, then a PasswordResetToken lets them set
// their own on first login, exactly like a forgotten-password flow).
import { randomBytes, createHash } from "crypto";
import bcrypt from "bcryptjs";
import { prisma, type Role } from "@elio/db";
import { Resend } from "resend";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour, same as password reset

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface InviteUserInput {
  email: string;
  role: Role;
  practiceId: string;
  appUrl: string;
}

export interface InviteUserResult {
  userId: string;
  alreadyExisted: boolean;
}

/** Creates (or re-invites, if not yet activated) a user in the given practice
 * and emails them a set-password link. Never overwrites an existing active user. */
export async function inviteUser(input: InviteUserInput): Promise<InviteUserResult> {
  const email = input.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.practiceId !== input.practiceId) {
      throw new Error("EMAIL_IN_USE_OTHER_PRACTICE");
    }
    // Re-send a set-password link for an existing (e.g. previously deactivated) user.
    await sendSetPasswordLink(existing.id, existing.email, input.appUrl);
    return { userId: existing.id, alreadyExisted: true };
  }

  // Random, never-communicated password — the invited user always sets their
  // own via the emailed token before they can log in.
  const randomPassword = randomBytes(24).toString("hex");
  const hashedPassword = await bcrypt.hash(randomPassword, 12);

  const user = await prisma.user.create({
    data: {
      email,
      hashedPassword,
      role: input.role,
      practiceId: input.practiceId,
      active: true,
    },
  });

  await sendSetPasswordLink(user.id, user.email, input.appUrl);
  return { userId: user.id, alreadyExisted: false };
}

async function sendSetPasswordLink(userId: string, email: string, appUrl: string): Promise<void> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await prisma.passwordResetToken.create({
    data: { tokenHash, userId, expiresAt },
  });

  const setUrl = `${appUrl}/reset-password/${rawToken}`;
  await sendInviteEmail(email, setUrl);
}

async function sendInviteEmail(to: string, setUrl: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "ELIO <no-reply@elio.dev>";

  if (!apiKey) {
    console.warn(`[auth] RESEND_API_KEY not set — invite link for ${to}: ${setUrl}`);
    return;
  }

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from,
    to,
    subject: "You've been invited to ELIO",
    html: `<p>You've been invited to join your practice's ELIO account. Click the link below to set your password and sign in. This link expires in 1 hour and can only be used once.</p>
<p><a href="${setUrl}">${setUrl}</a></p>
<p>If you weren't expecting this, you can safely ignore this email.</p>`,
  });
}
