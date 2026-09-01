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

export function resolveTherapistIdSet(settings: PaySettings): Set<string> {
  const fromSettings = settings.therapist_ids
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromSettings.length > 0) return new Set(fromSettings);

  const raw = process.env.DENTALLY_THERAPIST_IDS?.trim() ?? "";
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

export function resolveTherapyRatePerMinute(settings: PaySettings): number {
  const fromSettings = parseFloat(settings.therapy_rate);
  if (Number.isFinite(fromSettings) && fromSettings > 0) return fromSettings;

  const raw = process.env.DENTALLY_THERAPY_RATE?.trim();
  const fromEnv = raw ? parseFloat(raw) : NaN;
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;

  return parseFloat(DEFAULT_THERAPY_PER_MIN);
}

export function resolveNhsAmountSet(settings: PaySettings): Set<number> {
  const fromSettings = settings.nhs_amounts
    .split(/[,;]/)
    .map((s) => parseFloat(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (fromSettings.length > 0) return new Set(fromSettings);

  const raw = process.env.DENTALLY_NHS_AMOUNTS?.trim() ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => parseFloat(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
  );
}

export function resolveDentallySiteId(settings: PaySettings): string {
  const fromSettings = settings.dentally_site_id.trim();
  if (fromSettings) return fromSettings;
  return process.env.DENTALLY_SITE_ID?.trim() ?? "";
}

export function resolveLabBillSplit(settings: PaySettings): number {
  const n = parseFloat(settings.lab_bill_split);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.5;
}

export function resolveFinanceFeeSplit(settings: PaySettings): number {
  const n = parseFloat(settings.finance_fee_split);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.5;
}

export function paySettingsToJson(settings: PaySettings): Record<string, string> {
  return { ...settings };
}
