// Patient-facing confirmation email — mirrors packages/auth/lib/invite.ts's
// Resend pattern exactly (same env vars, same "log instead of send" fallback
// when RESEND_API_KEY isn't configured).
import { Resend } from "resend";

export async function sendSignupCompleteEmail(input: {
  to: string;
  patientFirstName: string;
  practiceName: string;
  planName: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "ELIO Plans <no-reply@elio.dev>";

  if (!input.to) return; // no email on file — nothing to send to

  if (!apiKey) {
    console.warn(`[plans] RESEND_API_KEY not set — signup confirmation for ${input.to} not sent`);
    return;
  }

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from,
    to: input.to,
    subject: `You're all set up — ${input.practiceName}`,
    html: `<p>Hi ${input.patientFirstName},</p>
<p>Your Direct Debit for the <strong>${input.planName}</strong> membership plan at ${input.practiceName} is now active. Thanks for signing up!</p>
<p>If you have any questions, just get in touch with the practice.</p>`,
  });
}
