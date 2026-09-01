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

export async function sendPatientInviteEmail(input: {
  to: string;
  patientFirstName: string;
  practiceName: string;
  planName: string;
  signupUrl: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "ELIO Plans <no-reply@elio.dev>";
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const fullUrl = input.signupUrl.startsWith("http") ? input.signupUrl : `${appOrigin}${input.signupUrl}`;

  if (!input.to) return;

  if (!apiKey) {
    console.warn(`[plans] RESEND_API_KEY not set — invite for ${input.to} not sent (${fullUrl})`);
    return;
  }

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from,
    to: input.to,
    subject: `Join ${input.practiceName} — ${input.planName}`,
    html: `<p>Hi ${input.patientFirstName},</p>
<p>You're invited to join the <strong>${input.planName}</strong> membership plan at ${input.practiceName}.</p>
<p><a href="${fullUrl}">Complete your signup and set up Direct Debit</a></p>
<p>If you have any questions, contact the practice.</p>`,
  });
  if (result.error) {
    console.error(`[plans] invite email to ${input.to} failed:`, result.error);
  } else {
    console.log(`[plans] invite email sent to ${input.to}, id=${result.data?.id}`);
  }
}

export async function sendPriceIncreaseEmail(input: {
  to: string;
  patientName: string;
  planName: string;
  practiceName: string;
  oldPriceFormatted: string;
  newPriceFormatted: string;
  effectiveDate: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "ELIO Plans <no-reply@elio.dev>";
  if (!input.to) return false;

  if (!apiKey) {
    console.warn(`[plans] RESEND_API_KEY not set — price increase email for ${input.to} not sent`);
    return false;
  }

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from,
    to: input.to,
    subject: `Changes to your ${input.planName} membership — ${input.practiceName}`,
    html: `<p>Hi ${input.patientName},</p>
<p>We're writing to let you know that the monthly fee for your <strong>${input.planName}</strong> membership at ${input.practiceName} will change from <strong>${input.oldPriceFormatted}</strong> to <strong>${input.newPriceFormatted}</strong>, effective from <strong>${input.effectiveDate}</strong>.</p>
<p>Your Direct Debit will be updated automatically — no action is required from you.</p>
<p>If you have any questions, please contact the practice.</p>`,
  });
  if (result.error) {
    console.error(`[plans] price increase email to ${input.to} failed:`, result.error);
    return false;
  }
  return true;
}
