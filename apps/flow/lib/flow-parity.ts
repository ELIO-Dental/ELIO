import type { FlowDashboardStats } from "./flow-service";

/** Legacy ElioFlow pipeline stats from GET /api/pipeline (pounds, not pence). */
export interface LegacyFlowPipelineStats {
  totalConsultations: number;
  attended: number;
  converted: number;
  stuck: number;
  totalPipelineValue: number;
  totalPlanned: number;
  totalPaid: number;
  elioCareCount: number;
  conversionRate: number;
}

export interface LegacyFlowExportFile {
  stats: LegacyFlowPipelineStats;
}

export function parseLegacyFlowExportFile(raw: string): LegacyFlowExportFile {
  const parsed = JSON.parse(raw) as LegacyFlowExportFile;
  if (!parsed?.stats || typeof parsed.stats.totalConsultations !== "number") {
    throw new Error("Invalid legacy Flow export — expected { stats: { totalConsultations, ... } }");
  }
  return parsed;
}

export interface FlowParityDiff {
  field: string;
  legacy: number;
  current: number;
  delta: number;
}

/** Compare new dashboard stats to a legacy pipeline export (money fields in pounds). */
export function compareFlowDashboardParity(
  legacy: LegacyFlowPipelineStats,
  current: FlowDashboardStats,
  tolerancePounds = 1
): { ok: boolean; diffs: FlowParityDiff[] } {
  const pairs: { field: string; legacy: number; current: number }[] = [
    { field: "totalConsultations", legacy: legacy.totalConsultations, current: current.totalConsultations },
    { field: "attended", legacy: legacy.attended, current: current.attended },
    { field: "converted", legacy: legacy.converted, current: current.converted },
    { field: "stuck", legacy: legacy.stuck, current: current.stuck },
    { field: "conversionRate", legacy: legacy.conversionRate, current: current.conversionRate },
    { field: "planSignUps", legacy: legacy.elioCareCount, current: current.planSignUps },
    {
      field: "totalPlanned",
      legacy: legacy.totalPlanned,
      current: Math.round(current.totalPlannedPence / 100),
    },
    {
      field: "totalPaid",
      legacy: legacy.totalPaid,
      current: Math.round(current.totalPaidPence / 100),
    },
  ];

  const diffs: FlowParityDiff[] = [];
  for (const { field, legacy: leg, current: cur } of pairs) {
    const delta = cur - leg;
    const moneyField = field === "totalPlanned" || field === "totalPaid";
    const ok = moneyField ? Math.abs(delta) <= tolerancePounds : delta === 0;
    if (!ok) diffs.push({ field, legacy: leg, current: cur, delta });
  }

  return { ok: diffs.length === 0, diffs };
}
