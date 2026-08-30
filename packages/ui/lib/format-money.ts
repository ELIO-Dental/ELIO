/** Format pence as GBP for table cells — display only, no business logic. */
export function formatMoneyGBP(pence: number, options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }) {
  const { minimumFractionDigits = 2, maximumFractionDigits = 2 } = options ?? {};
  return `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits, maximumFractionDigits })}`;
}

/** Like formatMoneyGBP but returns an em dash when the value is nullish. */
export function formatMoneyGBPOrDash(pence: number | null | undefined, options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }) {
  if (pence == null) return "—";
  return formatMoneyGBP(pence, options);
}
