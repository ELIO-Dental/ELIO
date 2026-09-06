/**
 * Step 34 — canonical month-run stage helpers (PDF §§3–7 pipeline).
 * Pure guards + merge helpers so fetch → ops → calculate order is enforceable.
 */

export type DentallyFetchJobStatus = "IDLE" | "RUNNING" | "SUCCESS" | "ERROR" | string | null | undefined;

/** Stage 5 must not run while stage 2 fetch is still writing lines. */
export function canRunPeriodCalculation(opts: {
  periodStatus: string;
  dentallyFetchStatus?: DentallyFetchJobStatus;
}): { ok: true } | { ok: false; status: number; error: string } {
  if (opts.periodStatus === "LOCKED") {
    return { ok: false, status: 409, error: "Pay period is locked" };
  }
  if (opts.dentallyFetchStatus === "RUNNING") {
    return {
      ok: false,
      status: 409,
      error: "Dentally fetch is still running — wait for it to finish before calculating",
    };
  }
  return { ok: true };
}

export type FinanceOpsSnapshot = {
  financeTermMonths: number | null;
  financeFeePence: number | null;
  financeFeeManual: boolean;
};

/** Stable key for matching Dentally lines across re-fetch (Step 32/34). */
export function privateLineIdentityKey(line: {
  dentallyInvoiceId?: string | null;
  dentallyLineKey?: string | null;
  amountPence: number;
}): string | null {
  const inv = line.dentallyInvoiceId?.trim();
  if (!inv) return null;
  const key = line.dentallyLineKey?.trim() || `amt:${line.amountPence}`;
  return `${inv}::${key}`;
}

/** Build lookup of ops finance fields from lines about to be replaced. */
export function buildPriorFinanceOpsLookup(
  lines: Array<{
    dentallyInvoiceId?: string | null;
    dentallyLineKey?: string | null;
    amountPence: number;
    financeTermMonths?: number | null;
    financeFeePence?: number | null;
    financeFeeManual?: boolean;
  }>
): Map<string, FinanceOpsSnapshot> {
  const map = new Map<string, FinanceOpsSnapshot>();
  for (const line of lines) {
    const id = privateLineIdentityKey(line);
    if (!id) continue;
    if (line.financeTermMonths == null && line.financeFeePence == null && !line.financeFeeManual) {
      continue;
    }
    map.set(id, {
      financeTermMonths: line.financeTermMonths ?? null,
      financeFeePence: line.financeFeePence ?? null,
      financeFeeManual: Boolean(line.financeFeeManual),
    });
  }
  return map;
}

/** Re-apply prior ops finance term/fee onto a freshly fetched line. */
export function mergeFinanceOpsOntoFetchedLine(
  fetched: {
    dentallyInvoiceId?: string | null;
    dentallyLineKey?: string | null;
    amountPence: number;
    isFinance: boolean;
  },
  prior: Map<string, FinanceOpsSnapshot>
): FinanceOpsSnapshot {
  const empty: FinanceOpsSnapshot = {
    financeTermMonths: null,
    financeFeePence: null,
    financeFeeManual: false,
  };
  if (!fetched.isFinance) return empty;
  const id = privateLineIdentityKey(fetched);
  if (!id) return empty;
  return prior.get(id) ?? empty;
}
