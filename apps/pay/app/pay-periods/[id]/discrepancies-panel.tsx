"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { formatMoneyGBPOrDash, toast } from "@elio/ui";
import {
  discrepancyAmountForBreakdown,
  discrepancyTypeBadgeClass,
  discrepancyTypeLabel,
  parsePayDiscrepancies,
  resolveAllDiscrepancies,
  resolveDiscrepancyAt,
  unresolvedDiscrepancyCount,
  type PayDiscrepancy,
} from "@/lib/pay-discrepancies";

function poundsToPence(amount: number): number {
  return Math.round(amount * 100);
}

/** Legacy discrepancies / items-for-review panel (Y2.6). */
export function DiscrepanciesPanel({
  payPeriodId,
  payslipEntryId,
  locked,
  initialDiscrepancies,
}: {
  payPeriodId: string;
  payslipEntryId: string;
  locked: boolean;
  initialDiscrepancies: unknown;
}) {
  const router = useRouter();
  const [discrepancies, setDiscrepancies] = useState<PayDiscrepancy[]>(() => parsePayDiscrepancies(initialDiscrepancies));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDiscrepancies(parsePayDiscrepancies(initialDiscrepancies));
  }, [initialDiscrepancies]);

  const saveDiscrepancies = useCallback(
    async (next: PayDiscrepancy[]) => {
      setPending(true);
      setError(null);
      try {
        const res = await fetch(`/pay/api/pay-periods/${payPeriodId}/entries`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payslipEntryId, discrepancies: next }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Failed to save discrepancies");
        setDiscrepancies(next);
        toast.success("Discrepancies saved");
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to save discrepancies";
        setError(msg);
        toast.error(msg);
      } finally {
        setPending(false);
      }
    },
    [payPeriodId, payslipEntryId, router]
  );

  const addToBreakdown = async (d: PayDiscrepancy, index: number) => {
    const amount = discrepancyAmountForBreakdown(d);
    if (amount <= 0) return;

    setPending(true);
    setError(null);
    try {
      const patientRes = await fetch(`/pay/api/pay-periods/${payPeriodId}/patients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payslipEntryId,
          patient: {
            name: d.patientName,
            date: d.date,
            amount,
            status: "paid",
            finance: false,
          },
        }),
      });
      const patientData = (await patientRes.json().catch(() => ({}))) as { error?: string };
      if (!patientRes.ok) throw new Error(patientData.error ?? "Failed to add patient");

      const next = resolveDiscrepancyAt(discrepancies, index);
      const entryRes = await fetch(`/pay/api/pay-periods/${payPeriodId}/entries`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payslipEntryId, discrepancies: next }),
      });
      const entryData = (await entryRes.json().catch(() => ({}))) as { error?: string };
      if (!entryRes.ok) throw new Error(entryData.error ?? "Failed to resolve discrepancy");

      setDiscrepancies(next);
      toast.success("Added to breakdown");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add to breakdown";
      setError(msg);
      toast.error(msg);
    } finally {
      setPending(false);
    }
  };

  if (discrepancies.length === 0) return null;

  const unresolved = unresolvedDiscrepancyCount(discrepancies);
  const resolved = discrepancies.filter((d) => d.resolved);

  return (
    <section
      className="rounded-(--radius-lg) border border-(--color-warning)/30 bg-(--color-warning)/5 p-4"
      data-testid="discrepancies-panel"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertCircle className="size-4 text-(--color-warning)" />
          <h4 className="text-body-sm font-semibold text-(--color-warning)">
            Items for review ({unresolved} unresolved / {discrepancies.length} total)
          </h4>
        </div>
        {!locked && unresolved > 0 ? (
          <button
            type="button"
            className="text-caption font-medium text-(--color-success)"
            disabled={pending}
            onClick={() => void saveDiscrepancies(resolveAllDiscrepancies(discrepancies))}
          >
            Resolve all
          </button>
        ) : null}
      </div>

      {error ? <p className="mb-2 text-caption text-(--color-danger)">{error}</p> : null}
      {pending ? (
        <p className="mb-2 flex items-center gap-1 text-caption text-(--color-text-tertiary)">
          <Loader2 className="size-3 animate-spin" /> Saving…
        </p>
      ) : null}

      <div className="max-h-64 space-y-2 overflow-y-auto">
        {discrepancies.map((d, index) => {
          if (d.resolved) return null;
          const addAmount = discrepancyAmountForBreakdown(d);
          return (
            <div key={`${d.patientName}-${d.date}-${index}`} className="rounded-(--radius-md) bg-(--color-surface) p-2 text-caption">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-(--color-text-primary)">{d.patientName}</span>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${discrepancyTypeBadgeClass(d.type)}`}
                  >
                    {discrepancyTypeLabel(d.type)}
                  </span>
                  {!locked && d.type === "in_log_not_system" && addAmount > 0 ? (
                    <button
                      type="button"
                      className="rounded bg-(--color-success)/10 px-1.5 py-0.5 text-[10px] font-medium text-(--color-success)"
                      disabled={pending}
                      onClick={() => void addToBreakdown(d, index)}
                    >
                      + Add {formatMoneyGBPOrDash(poundsToPence(addAmount))}
                    </button>
                  ) : null}
                  {!locked ? (
                    <button
                      type="button"
                      className="text-(--color-success)"
                      title="Mark as resolved"
                      disabled={pending}
                      onClick={() => void saveDiscrepancies(resolveDiscrepancyAt(discrepancies, index))}
                    >
                      <CheckCircle2 className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>
              <p className="mt-1 text-(--color-text-secondary)">
                {d.date}
                {d.logAmount && d.logAmount > 0 ? ` · Log: ${formatMoneyGBPOrDash(poundsToPence(d.logAmount))}` : ""}
                {d.invoicedAmount > 0 ? ` · System: ${formatMoneyGBPOrDash(poundsToPence(d.invoicedAmount))}` : ""}
                {d.paidAmount > 0 && d.paidAmount !== d.invoicedAmount
                  ? ` · Paid: ${formatMoneyGBPOrDash(poundsToPence(d.paidAmount))}`
                  : ""}
              </p>
              {d.notes ? <p className="mt-0.5 text-(--color-warning)">{d.notes}</p> : null}
            </div>
          );
        })}
      </div>

      {resolved.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-caption text-(--color-text-tertiary) hover:text-(--color-text-secondary)">
            {resolved.length} resolved items
          </summary>
          <div className="mt-2 space-y-1 opacity-70">
            {resolved.map((d, i) => (
              <div
                key={`resolved-${d.patientName}-${i}`}
                className="flex items-center justify-between rounded-(--radius-md) bg-(--color-success)/5 p-2 text-caption"
              >
                <span>
                  {d.patientName} — {formatMoneyGBPOrDash(poundsToPence(d.invoicedAmount || d.paidAmount || d.logAmount || 0))}
                </span>
                <span className="text-[10px] font-medium text-(--color-success)">RESOLVED</span>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
