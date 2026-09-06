/**
 * PDF §7 / Step 14 — PaidInvoiceLineLog helpers.
 * Identity requires Dentally invoice id — never amount-only orphans (collide).
 * lineKey is amount-based within invoice scope (treatment names are mutable).
 * Dentist id is encoded in the paid-log key so dual-clinician invoices do not
 * overwrite each other; legacy `amt:{pence}` rows still match when dentist matches.
 */

export type PaidLineIdentity = {
  dentallyInvoiceId?: string | null;
  dentallyPatientId?: string | null;
  treatmentDescription?: string | null;
  amountPence: number;
  /** Optional Dentally invoice_item id — preferred stable key when present. */
  dentallyItemId?: string | null;
  /** 0-based occurrence among same amount on this invoice for this dentist. */
  amountOccurrence?: number | null;
};

/** True when we can safely match/log across pay periods. */
export function hasStablePaidIdentity(line: PaidLineIdentity): boolean {
  return Boolean(line.dentallyInvoiceId?.trim());
}

/**
 * Dentally invoice id only. Returns null if missing — callers must skip log/check.
 * Never invents `orphan:${amount}` (collides across patients).
 */
export function buildPaidInvoiceId(line: PaidLineIdentity): string | null {
  const inv = line.dentallyInvoiceId?.trim();
  return inv || null;
}

/**
 * Immutable key within an invoice (no dentist — used on PrivateRevenueLineItem).
 * Prefer Dentally item id; else amt with optional occurrence suffix for same-amount lines.
 */
export function buildPaidLineKey(line: PaidLineIdentity): string {
  const itemId = line.dentallyItemId != null ? String(line.dentallyItemId).trim() : "";
  if (itemId) return `di:${itemId}`;
  const base = `amt:${line.amountPence}`;
  const occ = line.amountOccurrence;
  if (occ != null && occ > 0) return `${base}#${occ}`;
  return base;
}

/** Paid-log key scoped to dentist so two clinicians on one invoice do not collide. */
export function buildPaidLogLineKey(line: PaidLineIdentity, dentistId: string): string {
  return `${buildPaidLineKey(line)}:d:${dentistId}`;
}

export function resolvePaidIdentity(
  line: PaidLineIdentity,
  dentistId?: string | null
): { invoiceId: string; lineKey: string } | null {
  const invoiceId = buildPaidInvoiceId(line);
  if (!invoiceId) return null;
  const lineKey = dentistId?.trim()
    ? buildPaidLogLineKey(line, dentistId.trim())
    : buildPaidLineKey(line);
  return { invoiceId, lineKey };
}

export function paidLogCompositeKey(invoiceId: string, lineKey: string): string {
  return `${invoiceId}::${lineKey}`;
}

export type PaidLogEntry = {
  invoiceId: string;
  lineKey: string;
  payPeriodId: string;
  amountPence: number;
  dentistId: string;
};

/** Map of composite key → entry for O(1) double-pay checks. */
export function buildPaidLogLookup(entries: PaidLogEntry[]): Map<string, PaidLogEntry> {
  const map = new Map<string, PaidLogEntry>();
  for (const e of entries) {
    map.set(paidLogCompositeKey(e.invoiceId, e.lineKey), e);
  }
  return map;
}

function findPaidLogHit(
  line: PaidLineIdentity,
  lookup: Map<string, PaidLogEntry>,
  dentistId?: string | null
): PaidLogEntry | null {
  const invoiceId = buildPaidInvoiceId(line);
  if (!invoiceId) return null;

  if (dentistId?.trim()) {
    const scoped = resolvePaidIdentity(line, dentistId);
    if (scoped) {
      const hit = lookup.get(paidLogCompositeKey(scoped.invoiceId, scoped.lineKey));
      if (hit) return hit;
    }
  }

  // Legacy rows: `amt:{pence}` without `:d:{dentistId}` — only match same dentist.
  const legacyKey = buildPaidLineKey(line);
  const legacy = lookup.get(paidLogCompositeKey(invoiceId, legacyKey));
  if (legacy) {
    if (!dentistId?.trim() || legacy.dentistId === dentistId.trim()) return legacy;
    return null;
  }

  // Fallback scan: same invoice + amount + dentist (covers remapped keys).
  if (dentistId?.trim()) {
    for (const e of lookup.values()) {
      if (
        e.invoiceId === invoiceId &&
        e.amountPence === line.amountPence &&
        e.dentistId === dentistId.trim()
      ) {
        return e;
      }
    }
  }

  return null;
}

/**
 * True if this line was already paid out in a *different* pay period.
 * Same-period re-fetch/recalc must still be allowed.
 * No stable Dentally invoice id → cannot match (returns null).
 */
export function isAlreadyPaidInOtherPeriod(
  line: PaidLineIdentity,
  lookup: Map<string, PaidLogEntry>,
  currentPayPeriodId: string,
  dentistId?: string | null
): PaidLogEntry | null {
  const hit = findPaidLogHit(line, lookup, dentistId);
  if (!hit) return null;
  if (hit.payPeriodId === currentPayPeriodId) return null;
  return hit;
}

export function filterLinesNotAlreadyPaid<T extends PaidLineIdentity>(
  lines: T[],
  lookup: Map<string, PaidLogEntry>,
  currentPayPeriodId: string,
  dentistId?: string | null
): { kept: T[]; skipped: Array<{ line: T; prior: PaidLogEntry }> } {
  const kept: T[] = [];
  const skipped: Array<{ line: T; prior: PaidLogEntry }> = [];
  for (const line of lines) {
    const prior = isAlreadyPaidInOtherPeriod(line, lookup, currentPayPeriodId, dentistId);
    if (prior) skipped.push({ line, prior });
    else kept.push(line);
  }
  return { kept, skipped };
}

/** Dry-run seed report row (Step 14 B). */
export type PaidLogSeedCandidate = {
  invoiceId: string;
  lineKey: string;
  dentistId: string;
  payPeriodId: string;
  amountPence: number;
  source: "private_revenue_line" | "legacy_archive";
};

export function buildSeedCandidatesFromLines(
  lines: Array<
    PaidLineIdentity & {
      dentistId: string;
      payPeriodId: string;
      paymentStatus?: string | null;
      flagged?: boolean | null;
      amountOutstandingPence?: number | null;
      periodStatus?: string | null;
    }
  >,
  opts?: { lockedOnly?: boolean }
): { candidates: PaidLogSeedCandidate[]; skippedNoInvoiceId: number; skippedDraft: number } {
  const lockedOnly = opts?.lockedOnly !== false;
  const candidates: PaidLogSeedCandidate[] = [];
  let skippedNoInvoiceId = 0;
  let skippedDraft = 0;
  for (const line of lines) {
    if (lockedOnly && (line.periodStatus ?? "LOCKED") !== "LOCKED") {
      skippedDraft++;
      continue;
    }
    const status = (line.paymentStatus ?? "paid").toLowerCase();
    if (line.flagged) continue;
    if (status === "unpaid" || status === "partial") continue;
    if ((line.amountOutstandingPence ?? 0) > 0) continue;
    const id = resolvePaidIdentity(line, line.dentistId);
    if (!id) {
      skippedNoInvoiceId++;
      continue;
    }
    candidates.push({
      invoiceId: id.invoiceId,
      lineKey: id.lineKey,
      dentistId: line.dentistId,
      payPeriodId: line.payPeriodId,
      amountPence: line.amountPence,
      source: "private_revenue_line",
    });
  }
  return { candidates, skippedNoInvoiceId, skippedDraft };
}

export function summarizeSeedDryRun(
  candidates: PaidLogSeedCandidate[],
  existingKeys: Set<string>
): {
  wouldInsert: number;
  wouldSkipExisting: number;
  duplicatesInBatch: number;
  sample: PaidLogSeedCandidate[];
} {
  const seen = new Set<string>();
  let wouldInsert = 0;
  let wouldSkipExisting = 0;
  let duplicatesInBatch = 0;
  const sample: PaidLogSeedCandidate[] = [];
  for (const c of candidates) {
    const key = paidLogCompositeKey(c.invoiceId, c.lineKey);
    if (existingKeys.has(key)) {
      wouldSkipExisting++;
      continue;
    }
    if (seen.has(key)) {
      duplicatesInBatch++;
      continue;
    }
    seen.add(key);
    wouldInsert++;
    if (sample.length < 20) sample.push(c);
  }
  return { wouldInsert, wouldSkipExisting, duplicatesInBatch, sample };
}
