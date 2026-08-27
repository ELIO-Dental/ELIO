// Self-serve password reset — single-use, 1-hour-expiry token emailed via Resend.
import { randomBytes, createHash } from "crypto";
import { prisma } from "@elio/db";
import { Resend } from "resend";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Creates a single-use reset token for the given email (if a user exists) and emails it.
 * Always resolves without revealing whether the email exists (security — see FR-2 testing checklist). */
export async function requestPasswordReset(email: string, appUrl: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return; // do not reveal account existence

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await prisma.passwordResetToken.create({
    data: { tokenHash, userId: user.id, expiresAt },
  });

  const resetUrl = `${appUrl}/reset-password/${rawToken}`;
  await sendPasswordResetEmail(user.email, resetUrl);
}

async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "ELIO <no-reply@elio.dev>";

  if (!apiKey) {
    // Dev fallback — no Resend key configured yet. Log so the link is still usable in dev.
    console.warn(`[auth] RESEND_API_KEY not set — password reset link for ${to}: ${resetUrl}`);
    return;
  }

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from,
    to,
    subject: "Reset your ELIO password",
    html: `<p>Click the link below to reset your ELIO password. This link expires in 1 hour and can only be used once.</p>
<p><a href="${resetUrl}">${resetUrl}</a></p>
<p>If you didn't request this, you can safely ignore this email.</p>`,
  });
}

export interface TokenCheckResult {
  valid: boolean;
  userId?: string;
}

export async function validateResetToken(rawToken: string): Promise<TokenCheckResult> {
  const tokenHash = hashToken(rawToken);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record) return { valid: false };
  if (record.usedAt) return { valid: false };
  if (record.expiresAt.getTime() < Date.now()) return { valid: false };
  return { valid: true, userId: record.userId };
}

export async function consumeResetToken(rawToken: string, newHashedPassword: string): Promise<boolean> {
  const tokenHash = hashToken(rawToken);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) return false;

  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { hashedPassword: newHashedPassword } }),
    prisma.passwordResetToken.update({ where: { tokenHash }, data: { usedAt: new Date() } }),
  ]);
  return true;
}
