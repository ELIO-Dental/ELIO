import { formatMoneyGBPOrDash } from "@elio/ui";
import {
  discrepancyTypeBadgeClass,
  discrepancyTypeLabel,
} from "@/lib/pay-discrepancies";
import type { OpsReviewItem } from "@/lib/ops-review";

/**
 * PDF §7 / Step 13 — unified ops review queue (unpaid, finance term, unmapped, duplicates).
 * Server-rendered from period data; not dismissible.
 */
export function OperationsReviewPanel({ items }: { items: OpsReviewItem[] }) {
  if (items.length === 0) return null;

  const unresolved = items.filter((i) => !i.resolved);

  return (
    <section
      className="mb-8 rounded-(--radius-lg) border border-(--color-warning)/40 bg-(--color-warning)/5 px-5 py-4"
      data-testid="operations-review-panel"
      aria-label="Operations review list"
    >
      <h2 className="text-body font-semibold text-(--color-text-primary)">
        Operations review ({unresolved.length}
        {unresolved.length !== items.length ? ` / ${items.length}` : ""})
      </h2>
      <p className="mt-1 text-body-sm text-(--color-text-secondary)">
        Exceptions to clear before finalize — unpaid/partial, finance term, unmapped practitioners,
        and possible duplicates from a previous month. Ops/admin only.
      </p>
      <ul className="mt-4 space-y-2">
        {items.map((d, index) => (
          <li
            key={`${d.type}-${d.invoiceId ?? d.practitionerId ?? d.lineId ?? index}-${index}`}
            className="flex flex-wrap items-baseline justify-between gap-2 rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-surface) px-3 py-2"
          >
            <div className="min-w-0">
              <span
                className={`inline-block rounded px-1.5 py-0.5 text-caption font-medium ${discrepancyTypeBadgeClass(
                  d.type
                )}`}
              >
                {discrepancyTypeLabel(d.type)}
              </span>
              <p className="mt-1 text-body-sm font-medium text-(--color-text-primary)">
                {d.patientName}
                {d.dentistName ? ` · ${d.dentistName}` : ""}
                {d.practitionerId ? ` · ID ${d.practitionerId}` : ""}
              </p>
              <p className="text-caption text-(--color-text-secondary)">
                {d.date || "—"}
                {d.treatment ? ` · ${d.treatment}` : ""}
              </p>
              <p className="mt-0.5 text-caption text-(--color-text-tertiary)">{d.notes}</p>
            </div>
            <p className="shrink-0 text-body-sm font-semibold text-(--color-warning)">
              {formatMoneyGBPOrDash(Math.round(d.invoicedAmount * 100))}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
