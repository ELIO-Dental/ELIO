// Patient-facing confirmation email — mirrors packages/auth/lib/invite.ts's
// Resend pattern exactly (same env vars, same "log instead of send" fallback
// when RESEND_API_KEY isn't configured).
import { Resend } from "resend";
import type { EmailSendResult } from "./email-types";
import { absolutePortalUrl } from "./public-portal-url";

export async function sendSignupCompleteEmail(input: {
  to: string;
  patientFirstName: string;
  practiceName: string;
  planName: string;
}): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "ELIO Plans <no-reply@elio.dev>";
  const subject = `You're all set up — ${input.practiceName}`;

  if (!input.to) return { success: false, error: "No recipient email" };

  if (!apiKey) {
    console.warn(`[plans] RESEND_API_KEY not set — signup confirmation for ${input.to} not sent`);
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from,
    to: input.to,
    subject,
    html: `<p>Hi ${input.patientFirstName},</p>
<p>Your Direct Debit for the <strong>${input.planName}</strong> membership plan at ${input.practiceName} is now active. Thanks for signing up!</p>
<p>If you have any questions, just get in touch with the practice.</p>`,
  });
  if (result.error) {
    console.error(`[plans] signup confirmation email to ${input.to} failed:`, result.error);
    return { success: false, error: result.error.message };
  }
  console.log(`[plans] signup confirmation email sent to ${input.to}, id=${result.data?.id}`);
  return { success: true, messageId: result.data?.id };
}

export async function sendPatientInviteEmail(input: {
  to: string;
  patientFirstName: string;
  practiceName: string;
  planName: string;
  signupUrl: string;
}): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "ELIO Plans <no-reply@elio.dev>";
  const fullUrl = absolutePortalUrl(input.signupUrl);
  const subject = `Join ${input.practiceName} — ${input.planName}`;

  if (!input.to) return { success: false, error: "No recipient email" };

  if (!apiKey) {
    console.warn(`[plans] RESEND_API_KEY not set — invite for ${input.to} not sent (${fullUrl})`);
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from,
    to: input.to,
    subject,
    html: `<p>Hi ${input.patientFirstName},</p>
<p>You're invited to join the <strong>${input.planName}</strong> membership plan at ${input.practiceName}.</p>
<p><a href="${fullUrl}">Complete your signup and set up Direct Debit</a></p>
<p>If you have any questions, contact the practice.</p>`,
  });
  if (result.error) {
    console.error(`[plans] invite email to ${input.to} failed:`, result.error);
    return { success: false, error: result.error.message };
  }
  console.log(`[plans] invite email sent to ${input.to}, id=${result.data?.id}`);
  return { success: true, messageId: result.data?.id };
}

export async function sendPriceIncreaseEmail(input: {
  to: string;
  patientName: string;
  planName: string;
  practiceName: string;
  oldPriceFormatted: string;
  newPriceFormatted: string;
  effectiveDate: string;
}): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "ELIO Plans <no-reply@elio.dev>";
  const subject = `Changes to your ${input.planName} membership — ${input.practiceName}`;
  if (!input.to) return { success: false, error: "No recipient email" };

  if (!apiKey) {
    console.warn(`[plans] RESEND_API_KEY not set — price increase email for ${input.to} not sent`);
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from,
    to: input.to,
    subject,
    html: `<p>Hi ${input.patientName},</p>
<p>We're writing to let you know that the monthly fee for your <strong>${input.planName}</strong> membership at ${input.practiceName} will change from <strong>${input.oldPriceFormatted}</strong> to <strong>${input.newPriceFormatted}</strong>, effective from <strong>${input.effectiveDate}</strong>.</p>
<p>Your Direct Debit will be updated automatically — no action is required from you.</p>
<p>If you have any questions, please contact the practice.</p>`,
  });
  if (result.error) {
    console.error(`[plans] price increase email to ${input.to} failed:`, result.error);
    return { success: false, error: result.error.message };
  }
  return { success: true, messageId: result.data?.id };
}

export async function sendTermsSigningEmail(input: {
  to: string;
  patientName: string;
  planName: string;
  practiceName: string;
  signingUrl: string;
}): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "ELIO Plans <no-reply@elio.dev>";
  const fullUrl = absolutePortalUrl(input.signingUrl);
  const subject = `Terms & Conditions — ${input.planName} — ${input.practiceName}`;

  if (!input.to) return { success: false, error: "No recipient email" };

  if (!apiKey) {
    console.warn(`[plans] RESEND_API_KEY not set — terms email for ${input.to} not sent (${fullUrl})`);
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from,
    to: input.to,
    subject,
    html: `<p>Hi ${input.patientName},</p>
<p>As part of your enrolment in <strong>${input.planName}</strong> at ${input.practiceName}, please review and sign our Terms &amp; Conditions.</p>
<p><a href="${fullUrl}">Review &amp; sign Terms &amp; Conditions</a></p>
<p>This link expires in 7 days. If you have any questions, contact the practice.</p>`,
  });
  if (result.error) {
    console.error(`[plans] terms email to ${input.to} failed:`, result.error);
    return { success: false, error: result.error.message };
  }
  console.log(`[plans] terms email sent to ${input.to}, id=${result.data?.id}`);
  return { success: true, messageId: result.data?.id };
}

export async function sendPaymentFailedEmail(input: {
  to: string;
  patientName: string;
  planName: string;
  practiceName: string;
  amountFormatted: string;
  retryDateFormatted: string;
  supportEmail?: string;
}): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "ELIO Plans <no-reply@elio.dev>";
  const subject = `Payment failed — ${input.planName} — ${input.practiceName}`;
  const support = input.supportEmail?.trim();

  if (!input.to) return { success: false, error: "No recipient email" };

  if (!apiKey) {
    console.warn(`[plans] RESEND_API_KEY not set — payment failed email for ${input.to} not sent`);
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from,
    to: input.to,
    subject,
    html: `<p>Hi ${input.patientName},</p>
<p>We were unable to collect your payment of <strong>${input.amountFormatted}</strong> for your <strong>${input.planName}</strong> membership at ${input.practiceName}.</p>
<p>We will automatically retry this payment on <strong>${input.retryDateFormatted}</strong>. Please ensure sufficient funds are available in your account.</p>
${support ? `<p>If you have any questions or need to update your payment details, please contact us at <a href="mailto:${support}">${support}</a>.</p>` : `<p>If you have any questions, please contact the practice.</p>`}`,
  });
  if (result.error) {
    console.error(`[plans] payment failed email to ${input.to} failed:`, result.error);
    return { success: false, error: result.error.message };
  }
  console.log(`[plans] payment failed email sent to ${input.to}, id=${result.data?.id}`);
  return { success: true, messageId: result.data?.id };
}

export async function sendDdSetupEmail(input: {
  to: string;
  patientName: string;
  planName: string;
  practiceName: string;
  monthlyAmountFormatted: string;
  ddLink: string;
}): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "ELIO Plans <no-reply@elio.dev>";
  const subject = `Set up your Direct Debit — ${input.planName} — ${input.practiceName}`;

  if (!input.to) return { success: false, error: "No recipient email" };

  if (!apiKey) {
    console.warn(`[plans] RESEND_API_KEY not set — DD setup email for ${input.to} not sent (${input.ddLink})`);
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  const resend = new Resend(apiKey);
  const result = await resend.emails.send({
    from,
    to: input.to,
    subject,
    html: `<p>Hi ${input.patientName},</p>
<p>To complete your enrolment in <strong>${input.planName}</strong> at ${input.practiceName}, please set up your Direct Debit using the secure link below.</p>
<p><strong>Plan:</strong> ${input.planName}<br/><strong>Monthly amount:</strong> ${input.monthlyAmountFormatted}</p>
<p><a href="${input.ddLink}">Set up Direct Debit</a></p>
<p>This is a secure GoCardless payment page. Your bank details are protected by the Direct Debit Guarantee.</p>
<p>If you have any questions, contact the practice.</p>`,
  });
  if (result.error) {
    console.error(`[plans] DD setup email to ${input.to} failed:`, result.error);
    return { success: false, error: result.error.message };
  }
  console.log(`[plans] DD setup email sent to ${input.to}, id=${result.data?.id}`);
  return { success: true, messageId: result.data?.id };
}
