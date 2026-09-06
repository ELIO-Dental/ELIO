import { buildPaidLineKey, type PaidLineIdentity } from "./paid-invoice-line-log";

export type LineSourceType = "DENTALLY" | "MANUAL";

export type PrivateLineSourceMeta = {
  dentallyInvoiceId: string | null;
  dentallyLineKey: string | null;
  sourceType: LineSourceType;
  manualCreatedByUserId: string | null;
  manualNote: string | null;
  createdAt: Date | string | null;
};

/** Step 32 — Dentally-sourced line: invoice id + amount line key. */
export function dentallyLineSourceFields(line: PaidLineIdentity): {
  dentallyInvoiceId: string | null;
  dentallyLineKey: string;
  sourceType: "DENTALLY";
} {
  const invoiceId = line.dentallyInvoiceId?.trim() || null;
  return {
    dentallyInvoiceId: invoiceId,
    dentallyLineKey: buildPaidLineKey(line),
    sourceType: "DENTALLY",
  };
}

/** Step 32 — manual plug line requires author + note. */
export function manualLineSourceFields(input: {
  amountPence: number;
  actorUserId: string;
  note?: string | null;
}): {
  dentallyLineKey: string;
  sourceType: "MANUAL";
  manualCreatedByUserId: string;
  manualNote: string;
} {
  const note = input.note?.trim() || "";
  if (!note) {
    throw new Error("Manual patient lines require a note (Step 32 — no unexplained plugs)");
  }
  if (!input.actorUserId.trim()) {
    throw new Error("Manual patient lines require an author user id");
  }
  return {
    dentallyLineKey: buildPaidLineKey({ amountPence: input.amountPence }),
    sourceType: "MANUAL",
    manualCreatedByUserId: input.actorUserId,
    manualNote: note,
  };
}

/** UI label for expandable “source” panel. */
export function formatLineSourceSummary(line: PrivateLineSourceMeta): string {
  if (line.sourceType === "MANUAL" || line.manualCreatedByUserId) {
    const when =
      line.createdAt instanceof Date
        ? line.createdAt.toISOString().slice(0, 10)
        : typeof line.createdAt === "string"
          ? line.createdAt.slice(0, 10)
          : "—";
    return `Manual · ${line.manualCreatedByUserId ?? "unknown"} · ${when}${
      line.manualNote ? ` · ${line.manualNote}` : ""
    }`;
  }
  const inv = line.dentallyInvoiceId?.trim();
  const key = line.dentallyLineKey?.trim();
  if (inv && key) return `Dentally · invoice ${inv} · ${key}`;
  if (inv) return `Dentally · invoice ${inv}`;
  return "Source unknown";
}

export function isTraceablePrivateLine(line: PrivateLineSourceMeta): boolean {
  if (line.sourceType === "MANUAL" || line.manualCreatedByUserId) {
    return Boolean(line.manualCreatedByUserId && line.manualNote?.trim());
  }
  return Boolean(line.dentallyInvoiceId?.trim() && line.dentallyLineKey?.trim());
}
