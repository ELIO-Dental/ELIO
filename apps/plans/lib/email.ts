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
  const result = await resend.emails.send({
    from,
    to: input.to,
    subject: `You're all set up — ${input.practiceName}`,
    html: `<p>Hi ${input.patientFirstName},</p>
<p>Your Direct Debit for the <strong>${input.planName}</strong> membership plan at ${input.practiceName} is now active. Thanks for signing up!</p>
<p>If you have any questions, just get in touch with the practice.</p>`,
  });
  // Found live (2026-08-28): a missing/misconfigured RESEND_FROM_EMAIL or
  // API error can fail silently otherwise — Resend's SDK returns a `{error}`
  // field on failure rather than throwing, so a bare await here doesn't
  // surface it. Log both outcomes explicitly rather than assume success.
  if (result.error) {
    console.error(`[plans] signup confirmation email to ${input.to} failed:`, result.error);
  } else {
    console.log(`[plans] signup confirmation email sent to ${input.to}, id=${result.data?.id}`);
  }
}
