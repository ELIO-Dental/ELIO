/** Per-practice Pay settings (legacy AuraPay settings KV, Y3.5). */

export interface PaySettings {
  clinic_name: string;
  clinic_logo_url: string;
  clinic_address_line1: string;
  clinic_address_line2: string;
  clinic_city: string;
  clinic_postcode: string;
  clinic_phone: string;
  clinic_email: string;
  clinic_website: string;
  therapy_hourly_rate: string;
  therapy_rate: string;
  lab_bill_split: string;
  finance_fee_split: string;
  finance_rate_3m: string;
  finance_rate_12m: string;
  finance_rate_36m: string;
  finance_rate_60m: string;
  dentally_site_id: string;
  therapist_ids: string;
  nhs_amounts: string;
  /** Comma-separated treatment name phrases excluded from dentist gross (PDF §4.1). Empty = defaults. */
  excluded_treatments: string;
  cosmetic_consultation_treatment_code: string;
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_pass: string;
  email_from: string;
}

export type PaySettingsKey = keyof PaySettings;

export const PAY_SETTINGS_KEYS = [
  "clinic_name",
  "clinic_logo_url",
  "clinic_address_line1",
  "clinic_address_line2",
  "clinic_city",
  "clinic_postcode",
  "clinic_phone",
  "clinic_email",
  "clinic_website",
  "therapy_hourly_rate",
  "therapy_rate",
  "lab_bill_split",
  "finance_fee_split",
  "finance_rate_3m",
  "finance_rate_12m",
  "finance_rate_36m",
  "finance_rate_60m",
  "dentally_site_id",
  "therapist_ids",
  "nhs_amounts",
  "excluded_treatments",
  "cosmetic_consultation_treatment_code",
  "smtp_host",
  "smtp_port",
  "smtp_user",
  "smtp_pass",
  "email_from",
] as const satisfies readonly PaySettingsKey[];

const DEFAULT_THERAPY_HOURLY = "35";
const DEFAULT_THERAPY_PER_MIN = "0.5833";

export function defaultPaySettings(practiceName = ""): PaySettings {
  return {
    clinic_name: practiceName,
    clinic_logo_url: "",
    clinic_address_line1: "",
    clinic_address_line2: "",
    clinic_city: "",
    clinic_postcode: "",
    clinic_phone: "",
    clinic_email: "",
    clinic_website: "",
    therapy_hourly_rate: DEFAULT_THERAPY_HOURLY,
    therapy_rate: DEFAULT_THERAPY_PER_MIN,
    lab_bill_split: "0.50",
    finance_fee_split: "0.50",
    finance_rate_3m: "0.045",
    finance_rate_12m: "0.08",
    finance_rate_36m: "0.034",
    finance_rate_60m: "0.037",
    dentally_site_id: "",
    therapist_ids: "",
    nhs_amounts: "",
    excluded_treatments: "",
    cosmetic_consultation_treatment_code: "",
    smtp_host: "",
    smtp_port: "587",
    smtp_user: "",
    smtp_pass: "",
    email_from: "",
  };
}

function asString(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

export function parsePaySettingsJson(
  raw: unknown,
  options?: { practiceName?: string; cosmeticConsultationTreatmentCode?: string | null }
): PaySettings {
  const base = defaultPaySettings(options?.practiceName ?? "");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    if (options?.cosmeticConsultationTreatmentCode) {
      base.cosmetic_consultation_treatment_code = options.cosmeticConsultationTreatmentCode;
    }
    return base;
  }

  const record = raw as Record<string, unknown>;
  for (const key of PAY_SETTINGS_KEYS) {
    if (key in record) {
      base[key] = asString(record[key]);
    }
  }

  if (!base.cosmetic_consultation_treatment_code && options?.cosmeticConsultationTreatmentCode) {
    base.cosmetic_consultation_treatment_code = options.cosmeticConsultationTreatmentCode;
  }

  return base;
}

export function mergePaySettingsInput(current: PaySettings, input: Record<string, unknown>): PaySettings {
  const next = { ...current };
  for (const key of PAY_SETTINGS_KEYS) {
    if (key in input) {
      next[key] = asString(input[key]);
    }
  }
  return next;
}

const FINANCE_RATE_KEYS = [
  "finance_rate_3m",
  "finance_rate_12m",
  "finance_rate_36m",
  "finance_rate_60m",
] as const;

/** Step 17 — reject non-numeric / negative Tabeo rates. */
export function assertValidFinanceRateSettings(settings: PaySettings): void {
  for (const key of FINANCE_RATE_KEYS) {
    const n = Number(settings[key]);
    if (!Number.isFinite(n) || n < 0) {
      throw new Error(`Invalid ${key}: must be a number ≥ 0 (decimal rate, e.g. 0.08 for 8%)`);
    }
  }
}

export function syncTherapyRates(settings: PaySettings, changed: "hourly" | "per_min"): PaySettings {
  const next = { ...settings };
  if (changed === "hourly") {
    const hourly = parseFloat(next.therapy_hourly_rate) || 0;
    next.therapy_rate = hourly > 0 ? (hourly / 60).toFixed(4) : next.therapy_rate;
  } else {
    const perMin = parseFloat(next.therapy_rate) || 0;
    next.therapy_hourly_rate = perMin > 0 ? (perMin * 60).toFixed(2) : next.therapy_hourly_rate;
  }
  return next;
}

export function paySettingsForExport(settings: PaySettings): PaySettings {
  return {
    ...settings,
    smtp_pass: settings.smtp_pass ? "***" : "",
  };
}

/** Seed therapist practitioner user.ids (PDF §0.4 / Step 11). */
export const DEFAULT_THERAPIST_PRACTITIONER_IDS = ["288298"] as const;

export function resolveTherapistIdSet(settings: PaySettings): Set<string> {
  const fromSettings = settings.therapist_ids
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromSettings.length > 0) return new Set(fromSettings);

  const raw = process.env.DENTALLY_THERAPIST_IDS?.trim() ?? "";
  if (raw) {
    return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
  }

  // Step 11 / §0.4 — Taryn Dawson (Dentally user.id) when settings blank.
  return new Set([...DEFAULT_THERAPIST_PRACTITIONER_IDS]);
}

export function resolveTherapyRatePerMinute(settings: PaySettings): number {
  const fromSettings = parseFloat(settings.therapy_rate);
  if (Number.isFinite(fromSettings) && fromSettings > 0) return fromSettings;

  const raw = process.env.DENTALLY_THERAPY_RATE?.trim();
  const fromEnv = raw ? parseFloat(raw) : NaN;
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;

  return parseFloat(DEFAULT_THERAPY_PER_MIN);
}

/** PDF §0.6 — current NHS band charges + differentials (£). */
export const DEFAULT_NHS_BAND_AMOUNTS_GBP = [
  27.4, 75.3, 326.7, 47.9, 299.3, 251.4,
] as const;

/** PDF §0.6 — previous-year NHS band charges + differentials (£). */
export const DEFAULT_NHS_BAND_AMOUNTS_PREVIOUS_GBP = [
  26.8, 73.5, 319.1, 23.8, 46.7,
] as const;

export function resolveNhsAmountSet(settings: PaySettings): Set<number> {
  const fromSettings = settings.nhs_amounts
    .split(/[,;]/)
    .map((s) => parseFloat(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (fromSettings.length > 0) return new Set(fromSettings);

  const raw = process.env.DENTALLY_NHS_AMOUNTS?.trim() ?? "";
  if (raw) {
    return new Set(
      raw
        .split(",")
        .map((s) => parseFloat(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0)
    );
  }

  // Step 9 / §0.6 — seed current + previous year when settings blank.
  return new Set([...DEFAULT_NHS_BAND_AMOUNTS_GBP, ...DEFAULT_NHS_BAND_AMOUNTS_PREVIOUS_GBP]);
}

/** PDF §4.1 — practice-owned treatment name phrases (case-insensitive substring). */
export function resolveExcludedTreatmentPhrases(settings: PaySettings): string[] {
  const fromSettings = settings.excluded_treatments
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromSettings.length > 0) return fromSettings;
  return ["CBCT", "CT Scan", "Cone Beam"];
}

export function resolveDentallySiteId(settings: PaySettings): string {
  const fromSettings = settings.dentally_site_id.trim();
  if (fromSettings) return fromSettings;
  return process.env.DENTALLY_SITE_ID?.trim() ?? "";
}

import { parseRateToBasisPoints, parseShareToBasisPoints, applySharePence } from "./money-pence";

export function resolveLabBillSplit(settings: PaySettings): number {
  return parseShareToBasisPoints(settings.lab_bill_split, 5000);
}

export function resolveFinanceFeeSplit(settings: PaySettings): number {
  return parseShareToBasisPoints(settings.finance_fee_split, 5000);
}

export { applySharePence, parseShareToBasisPoints, parseRateToBasisPoints };

export function paySettingsToJson(settings: PaySettings): Record<string, string> {
  return { ...settings };
}
