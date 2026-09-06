export type PayslipAdjustment = {
  /** Required note (Step 27). */
  description: string;
  /** Display pounds (legacy UI); prefer amountPence for persistence. */
  amount: number;
  /** Integer pence (Step 27). */
  amountPence: number;
  type: "addition" | "deduction";
  createdBy?: string | null;
  createdAt?: string | null;
};

export type PayslipLabBill = {
  lab_name: string;
  amount: number;
  description?: string;
  /** Step 15 — link to bill file/URL on payslip. */
  file_url?: string;
};

function toAmountPence(raw: Record<string, unknown>): number {
  if (raw.amountPence != null && Number.isFinite(Number(raw.amountPence))) {
    return Math.round(Number(raw.amountPence));
  }
  const pounds = Number(raw.amount);
  if (!Number.isFinite(pounds)) return 0;
  return Math.round(pounds * 100);
}

export function parsePayslipAdjustments(value: unknown): PayslipAdjustment[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item) => {
      const amountPence = toAmountPence(item);
      return {
        description: String(item.description ?? item.note ?? ""),
        amount: amountPence / 100,
        amountPence,
        type: item.type === "addition" ? ("addition" as const) : ("deduction" as const),
        createdBy: typeof item.createdBy === "string" ? item.createdBy : null,
        createdAt: typeof item.createdAt === "string" ? item.createdAt : null,
      };
    });
}

/** Step 27 — reject empty notes / non-positive amounts on non-empty rows. */
export function validatePayslipAdjustments(rows: PayslipAdjustment[]): string | null {
  for (const a of rows) {
    if (a.amountPence === 0 && !a.description.trim()) continue;
    if (!(a.amountPence > 0) || !Number.isInteger(a.amountPence)) {
      return "Each adjustment amount must be a positive amount in pence";
    }
    if (!a.description.trim()) {
      return "Each adjustment requires a note";
    }
  }
  return null;
}

export function sumAdjustmentsToManualPence(rows: PayslipAdjustment[]): number {
  let total = 0;
  for (const a of rows) {
    if (!(a.amountPence > 0)) continue;
    total += a.type === "deduction" ? -a.amountPence : a.amountPence;
  }
  return total;
}

/** Keep rows with amount; stamp who/when on new lines. */
export function prepareAdjustmentsForSave(
  rows: PayslipAdjustment[],
  actorUserId: string,
  now = new Date()
): PayslipAdjustment[] {
  const iso = now.toISOString();
  return rows
    .filter((a) => a.amountPence > 0)
    .map((a) => ({
      description: a.description.trim(),
      amount: a.amountPence / 100,
      amountPence: a.amountPence,
      type: a.type,
      createdBy: a.createdBy?.trim() || actorUserId,
      createdAt: a.createdAt || iso,
    }));
}

export function parsePayslipLabBills(value: unknown): PayslipLabBill[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is PayslipLabBill => Boolean(item && typeof item === "object"))
    .map((item) => {
      const raw = item as PayslipLabBill & { fileUrl?: string; link?: string };
      const fileUrl =
        (typeof raw.file_url === "string" && raw.file_url.trim()) ||
        (typeof raw.fileUrl === "string" && raw.fileUrl.trim()) ||
        (typeof raw.link === "string" && raw.link.trim()) ||
        undefined;
      return {
        lab_name: String(raw.lab_name ?? ""),
        amount: Number(raw.amount) || 0,
        description: raw.description,
        file_url: fileUrl || undefined,
      };
    });
}
