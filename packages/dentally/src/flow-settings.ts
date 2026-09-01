/** Per-practice Flow settings (legacy ElioFlow settings page, F3.1). */

export interface FlowSettings {
  planDisplayName: string;
  cosmeticConsultReason: string;
  depositThresholdPence: number;
  paidConversionThresholdPence: number;
  /** F3.3 — sidebar/header title (legacy appName). Falls back to practice name. */
  appDisplayName: string;
  /** F3.3 — optional logo URL shown in Flow sidebar (legacy logoUrl). */
  logoUrl: string;
}

export const DEFAULT_FLOW_SETTINGS: FlowSettings = {
  planDisplayName: "AuraCare",
  cosmeticConsultReason: "cosmetic consultation",
  depositThresholdPence: 5000,
  paidConversionThresholdPence: 45_000,
  appDisplayName: "",
  logoUrl: "",
};

export function parseFlowSettingsJson(raw: unknown): FlowSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_FLOW_SETTINGS };
  const row = raw as Record<string, unknown>;
  return {
    planDisplayName:
      typeof row.planDisplayName === "string" && row.planDisplayName.trim()
        ? row.planDisplayName.trim()
        : DEFAULT_FLOW_SETTINGS.planDisplayName,
    cosmeticConsultReason:
      typeof row.cosmeticConsultReason === "string" && row.cosmeticConsultReason.trim()
        ? row.cosmeticConsultReason.trim()
        : DEFAULT_FLOW_SETTINGS.cosmeticConsultReason,
    depositThresholdPence: parsePositiveInt(row.depositThresholdPence, DEFAULT_FLOW_SETTINGS.depositThresholdPence),
    paidConversionThresholdPence: parsePositiveInt(
      row.paidConversionThresholdPence,
      DEFAULT_FLOW_SETTINGS.paidConversionThresholdPence
    ),
    appDisplayName: typeof row.appDisplayName === "string" ? row.appDisplayName.trim() : "",
    logoUrl: typeof row.logoUrl === "string" ? row.logoUrl.trim() : "",
  };
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.round(n);
}

export function mergeFlowSettingsInput(
  current: FlowSettings,
  input: Record<string, unknown>
): FlowSettings {
  const next = { ...current };
  if (typeof input.planDisplayName === "string") next.planDisplayName = input.planDisplayName.trim();
  if (typeof input.cosmeticConsultReason === "string") {
    next.cosmeticConsultReason = input.cosmeticConsultReason.trim();
  }
  if ("depositThresholdPence" in input) {
    next.depositThresholdPence = parsePositiveInt(input.depositThresholdPence, current.depositThresholdPence);
  }
  if ("paidConversionThresholdPence" in input) {
    next.paidConversionThresholdPence = parsePositiveInt(
      input.paidConversionThresholdPence,
      current.paidConversionThresholdPence
    );
  }
  if (typeof input.appDisplayName === "string") next.appDisplayName = input.appDisplayName.trim();
  if (typeof input.logoUrl === "string") next.logoUrl = input.logoUrl.trim();
  return next;
}

export function flowSettingsToJson(settings: FlowSettings): object {
  return { ...settings };
}

/** F3.3 — sidebar title: custom app name, then practice name, then default. */
export function resolveFlowBrandTitle(
  settings: Pick<FlowSettings, "appDisplayName">,
  practiceName: string
): string {
  return settings.appDisplayName || practiceName.trim() || "ELIO FLOW";
}
