import { scopedDb } from "@elio/db";

/** Legacy ElioPlans setting keys (Part 15). */
export const SettingKeys = {
  GOCARDLESS_ENVIRONMENT: "gocardless.environment",
  GOCARDLESS_COLLECTION_DAY: "gocardless.collection_day",
  GOCARDLESS_RETRY_DAY: "gocardless.retry_day",
  GOCARDLESS_CREDITOR_ID: "gocardless.creditor_id",

  PRACTICE_NAME: "practice.name",
  PRACTICE_CURRENCY: "practice.currency",
  PRACTICE_VAT_ENABLED: "practice.vat_enabled",
  PRACTICE_SUPPORT_EMAIL: "practice.support_email",
  PRACTICE_SUPPORT_PHONE: "practice.support_phone",

  BRAND_NAME: "brand.name",
  BRAND_TAGLINE: "brand.tagline",
  BRAND_LOGO_URL: "brand.logo_url",
  BRAND_FAVICON_URL: "brand.favicon_url",
  BRAND_PRIMARY_COLOR: "brand.primary_color",
  BRAND_SECONDARY_COLOR: "brand.secondary_color",
  BRAND_ACCENT_COLOR: "brand.accent_color",
  BRAND_EMAIL_SENDER_NAME: "brand.email_sender_name",
  BRAND_CUSTOM_DOMAIN: "brand.custom_domain",

  MEMBERSHIP_MIN_TERM_MONTHS: "membership.min_term_months",

  PAYMENT_MAX_RETRIES: "payment.max_retries",
  PAYMENT_GRACE_PERIOD_DAYS: "payment.grace_period_days",
  PAYMENT_AUTO_SUSPEND_REDEEMS: "payment.auto_suspend_redeems",

  DENTIST_PAYOUT_PER_EXAM: "payout.dentist_per_exam",
} as const;

export type SettingKey = (typeof SettingKeys)[keyof typeof SettingKeys];

const defaultSettings: Record<string, string> = {
  [SettingKeys.GOCARDLESS_ENVIRONMENT]: "sandbox",
  [SettingKeys.GOCARDLESS_COLLECTION_DAY]: "1",
  [SettingKeys.GOCARDLESS_RETRY_DAY]: "11",
  [SettingKeys.PRACTICE_NAME]: "Aura Plans",
  [SettingKeys.PRACTICE_CURRENCY]: "GBP",
  [SettingKeys.PRACTICE_VAT_ENABLED]: "false",
  [SettingKeys.BRAND_NAME]: "Aura Plans",
  [SettingKeys.BRAND_TAGLINE]: "Your patients, your plan",
  [SettingKeys.BRAND_PRIMARY_COLOR]: "#0891b2",
  [SettingKeys.BRAND_SECONDARY_COLOR]: "#8b5cf6",
  [SettingKeys.BRAND_ACCENT_COLOR]: "#06b6d4",
  [SettingKeys.BRAND_EMAIL_SENDER_NAME]: "Aura Plans",
  [SettingKeys.MEMBERSHIP_MIN_TERM_MONTHS]: "12",
  [SettingKeys.PAYMENT_MAX_RETRIES]: "3",
  [SettingKeys.PAYMENT_GRACE_PERIOD_DAYS]: "14",
  [SettingKeys.PAYMENT_AUTO_SUSPEND_REDEEMS]: "true",
  [SettingKeys.DENTIST_PAYOUT_PER_EXAM]: "25.00",
};

/** Keys writable via PUT /plans/api/settings (secrets/env-only keys excluded). */
export const EDITABLE_SETTING_KEYS = new Set<string>([
  SettingKeys.GOCARDLESS_COLLECTION_DAY,
  SettingKeys.GOCARDLESS_RETRY_DAY,
  SettingKeys.GOCARDLESS_CREDITOR_ID,
  SettingKeys.PRACTICE_NAME,
  SettingKeys.PRACTICE_CURRENCY,
  SettingKeys.PRACTICE_VAT_ENABLED,
  SettingKeys.PRACTICE_SUPPORT_EMAIL,
  SettingKeys.PRACTICE_SUPPORT_PHONE,
  SettingKeys.BRAND_NAME,
  SettingKeys.BRAND_TAGLINE,
  SettingKeys.BRAND_LOGO_URL,
  SettingKeys.BRAND_FAVICON_URL,
  SettingKeys.BRAND_PRIMARY_COLOR,
  SettingKeys.BRAND_SECONDARY_COLOR,
  SettingKeys.BRAND_ACCENT_COLOR,
  SettingKeys.BRAND_EMAIL_SENDER_NAME,
  SettingKeys.BRAND_CUSTOM_DOMAIN,
  SettingKeys.MEMBERSHIP_MIN_TERM_MONTHS,
  SettingKeys.PAYMENT_MAX_RETRIES,
  SettingKeys.PAYMENT_GRACE_PERIOD_DAYS,
  SettingKeys.PAYMENT_AUTO_SUSPEND_REDEEMS,
  SettingKeys.DENTIST_PAYOUT_PER_EXAM,
]);

export async function getAllPlanSettings(practiceId: string): Promise<Record<string, string>> {
  const db = scopedDb(practiceId);
  const practice = await db.practice.findUnique({ where: { id: practiceId }, select: { name: true } });
  const stored = await db.planPracticeSetting.findMany({ where: { practiceId } });

  const result: Record<string, string> = { ...defaultSettings };
  if (practice?.name) {
    result[SettingKeys.PRACTICE_NAME] = practice.name;
    if (!stored.some((s) => s.key === SettingKeys.BRAND_NAME)) {
      result[SettingKeys.BRAND_NAME] = practice.name;
    }
  }

  for (const row of stored) {
    result[row.key] = row.value;
  }

  result[SettingKeys.GOCARDLESS_ENVIRONMENT] = process.env.GOCARDLESS_ENVIRONMENT || "sandbox";

  return result;
}

export async function setPlanSettings(practiceId: string, updates: Record<string, string>): Promise<Record<string, string>> {
  const db = scopedDb(practiceId);

  for (const [key, value] of Object.entries(updates)) {
    if (!EDITABLE_SETTING_KEYS.has(key)) continue;

    await db.planPracticeSetting.upsert({
      where: { practiceId_key: { practiceId, key } },
      create: { practiceId, key, value: String(value) },
      update: { value: String(value) },
    });

    if (key === SettingKeys.PRACTICE_NAME && value.trim()) {
      await db.practice.update({ where: { id: practiceId }, data: { name: value.trim() } });
    }
  }

  return getAllPlanSettings(practiceId);
}

export async function getBrandingSettings(practiceId: string) {
  const settings = await getAllPlanSettings(practiceId);
  return {
    brandName: settings[SettingKeys.BRAND_NAME] || "Aura Plans",
    tagline: settings[SettingKeys.BRAND_TAGLINE] || "Your patients, your plan",
    logoUrl: settings[SettingKeys.BRAND_LOGO_URL] || "",
    faviconUrl: settings[SettingKeys.BRAND_FAVICON_URL] || "",
    primaryColor: settings[SettingKeys.BRAND_PRIMARY_COLOR] || "#0891b2",
    secondaryColor: settings[SettingKeys.BRAND_SECONDARY_COLOR] || "#8b5cf6",
    accentColor: settings[SettingKeys.BRAND_ACCENT_COLOR] || "#06b6d4",
    emailSenderName: settings[SettingKeys.BRAND_EMAIL_SENDER_NAME] || "Aura Plans",
    customDomain: settings[SettingKeys.BRAND_CUSTOM_DOMAIN] || "",
  };
}

export async function setBrandingSettings(
  practiceId: string,
  branding: {
    brandName?: string;
    tagline?: string;
    logoUrl?: string;
    faviconUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    emailSenderName?: string;
    customDomain?: string;
  }
) {
  const mapping: Record<string, string | undefined> = {
    [SettingKeys.BRAND_NAME]: branding.brandName,
    [SettingKeys.BRAND_TAGLINE]: branding.tagline,
    [SettingKeys.BRAND_LOGO_URL]: branding.logoUrl,
    [SettingKeys.BRAND_FAVICON_URL]: branding.faviconUrl,
    [SettingKeys.BRAND_PRIMARY_COLOR]: branding.primaryColor,
    [SettingKeys.BRAND_SECONDARY_COLOR]: branding.secondaryColor,
    [SettingKeys.BRAND_ACCENT_COLOR]: branding.accentColor,
    [SettingKeys.BRAND_EMAIL_SENDER_NAME]: branding.emailSenderName,
    [SettingKeys.BRAND_CUSTOM_DOMAIN]: branding.customDomain,
  };

  const updates: Record<string, string> = {};
  for (const [key, value] of Object.entries(mapping)) {
    if (value !== undefined) updates[key] = value;
  }

  return setPlanSettings(practiceId, updates);
}

export function getGoCardlessEnvStatus() {
  const hasToken = !!process.env.GOCARDLESS_ACCESS_TOKEN;
  const tokenPrefix = hasToken ? `${process.env.GOCARDLESS_ACCESS_TOKEN!.slice(0, 8)}...` : "NOT SET";
  return {
    hasToken,
    tokenPrefix,
    environment: process.env.GOCARDLESS_ENVIRONMENT || "sandbox",
    hasWebhookSecret: !!process.env.GOCARDLESS_WEBHOOK_SECRET,
    mockFallbackEnabled:
      process.env.GOCARDLESS_ALLOW_MOCK === "true" && process.env.NODE_ENV !== "production",
  };
}
