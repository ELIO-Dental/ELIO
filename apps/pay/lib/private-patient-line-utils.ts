export function totalsFromLines(lines: Array<{ amountPaidPence?: number | null; isFinance: boolean; financeFeePence?: number | null }>) {
  let grossPrivateRevenuePence = 0;
  let financeFeesPence = 0;
  for (const line of lines) {
    grossPrivateRevenuePence += line.amountPaidPence ?? 0;
    if (line.isFinance && line.financeFeePence) {
      financeFeesPence += line.financeFeePence;
    }
  }
  return { grossPrivateRevenuePence, financeFeesPence };
}

/** Resolve legacy patient_index to a line item id (sorted by invoice date). */
export function resolveLineItemIdByIndex(
  lines: Array<{ id: string; invoiceDate: string | null; createdAt: Date }>,
  patientIndex: number
): string | null {
  if (patientIndex < 0 || patientIndex >= lines.length) return null;
  const sorted = [...lines].sort((a, b) => {
    const dateCompare = (a.invoiceDate ?? "").localeCompare(b.invoiceDate ?? "");
    if (dateCompare !== 0) return dateCompare;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  return sorted[patientIndex]?.id ?? null;
}
