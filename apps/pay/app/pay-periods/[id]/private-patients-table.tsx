"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Plus, Trash2, AlertCircle } from "lucide-react";
import { formatMoneyGBPOrDash, TablePagination, useClientTablePagination, toast, ConfirmDialog } from "@elio/ui";
import { privatePatientsFooterTotals } from "@/lib/private-patients-table-format";
import {
  FINANCE_TERMS_MONTHS,
  isValidFinanceTerm,
  resolveFinanceRateForTerm,
  suggestFinanceFeePence,
  type FinanceTermMonths,
} from "@/lib/finance-fee";
import { formatLineSourceSummary, isTraceablePrivateLine } from "@/lib/line-source";

export interface PrivatePatientRow {
  id: string;
  patientName: string | null;
  invoiceDate: string | null;
  amountPence: number;
  amountPaidPence: number | null;
  amountOutstandingPence: number | null;
  paymentStatus: string | null;
  durationMins: number | null;
  hourlyRatePence: number | null;
  isFinance: boolean;
  financeFeePence: number | null;
  financeTermMonths: number | null;
  financeFeeManual: boolean;
  flagged: boolean;
  flagReason: string | null;
  treatmentDescription: string | null;
  /** Step 32 */
  dentallyInvoiceId?: string | null;
  dentallyLineKey?: string | null;
  sourceType?: string | null;
  manualCreatedByUserId?: string | null;
  manualNote?: string | null;
  createdAt?: string | Date | null;
}

export type FinanceRatesProp = {
  finance_rate_3m: string;
  finance_rate_12m: string;
  finance_rate_36m: string;
  finance_rate_60m: string;
};

function penceToPoundsInput(pence: number): string {
  return (pence / 100).toFixed(2);
}

function hourlyRateClass(pence: number | null): string {
  if (pence == null) return "text-(--color-text-tertiary)";
  const pounds = pence / 100;
  if (pounds >= 300) return "font-medium text-(--color-success)";
  if (pounds >= 200) return "font-medium text-(--color-brand)";
  return "font-medium text-(--color-text-secondary)";
}

/** Interactive private patients table (legacy Y2.5 + Step 16 term/fee). */
export function PrivatePatientsTable({
  payPeriodId,
  payslipEntryId,
  locked,
  initialLines,
  financeRates,
}: {
  payPeriodId: string;
  payslipEntryId: string;
  locked: boolean;
  initialLines: PrivatePatientRow[];
  financeRates: FinanceRatesProp;
}) {
  const router = useRouter();
  const [lines, setLines] = useState(initialLines);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Previously the trash icon deleted the line immediately with only an optimistic
  // UI update — one misclick permanently removed a patient revenue line feeding the
  // dentist's pay figures, with no undo. Every other delete in this app confirms first.
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; patientName: string | null } | null>(null);
  const {
    items: pageLines,
    page,
    pageSize,
    totalCount,
    setPage,
    showPagination,
  } = useClientTablePagination(lines, 25, [payslipEntryId]);

  useEffect(() => {
    setLines(initialLines);
  }, [initialLines]);

  const apiBase = `/pay/api/pay-periods/${payPeriodId}/patients`;

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const mutate = useCallback(
    async (lineId: string, fn: () => Promise<Response>, successMsg?: string) => {
      setPendingId(lineId);
      setError(null);
      try {
        const res = await fn();
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Request failed");
        if (successMsg) toast.success(successMsg);
        refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Request failed";
        setError(msg);
        toast.error(msg);
      } finally {
        setPendingId(null);
      }
    },
    [refresh]
  );

  const updateLine = useCallback(
    (lineId: string, updates: Record<string, unknown>, options?: { optimistic?: boolean; successMsg?: string }) => {
      if (options?.optimistic !== false) {
        setLines((prev) =>
          prev.map((line) => {
            if (line.id !== lineId) return line;
            const next = { ...line };
            if (typeof updates.name === "string") next.patientName = updates.name;
            if (typeof updates.date === "string") next.invoiceDate = updates.date;
            if (updates.amount != null) next.amountPence = Math.round(Number(updates.amount) * 100);
            if (updates.status === "paid") {
              next.paymentStatus = "paid";
              next.amountPaidPence = next.amountPence;
              next.amountOutstandingPence = 0;
              next.flagged = next.isFinance;
            } else if (updates.status === "unpaid") {
              next.paymentStatus = "unpaid";
              next.amountPaidPence = 0;
              next.amountOutstandingPence = next.amountPence;
              next.flagged = true;
              next.flagReason = "Invoice not paid";
            } else if (updates.status === "partial") {
              next.paymentStatus = "partial";
              next.flagged = true;
              next.flagReason = "Partial payment";
            }
            if (updates.finance != null) next.isFinance = Boolean(updates.finance);
            if (updates.financeTerm !== undefined) {
              const t = updates.financeTerm === "" || updates.financeTerm == null ? null : Number(updates.financeTerm);
              next.financeTermMonths = t;
              if (isValidFinanceTerm(t) && !next.financeFeeManual) {
                const rate = resolveFinanceRateForTerm(financeRates, t as FinanceTermMonths);
                next.financeFeePence = suggestFinanceFeePence(next.amountPence, rate);
              }
            }
            if (updates.financeFee != null) {
              next.financeFeePence = Math.round(Number(updates.financeFee) * 100);
              next.financeFeeManual = true;
            }
            if (updates.resolved === true) {
              next.flagged = false;
              next.flagReason = null;
            }
            return next;
          })
        );
      }

      void mutate(
        lineId,
        () =>
          fetch(apiBase, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payslipEntryId, lineItemId: lineId, updates }),
          }),
        options?.successMsg
      );
    },
    [apiBase, financeRates, mutate, payslipEntryId]
  );

  const addPatient = () => {
    const note = window.prompt("Note for this manual line (required — Step 32 traceability):");
    if (note == null) return;
    if (!note.trim()) {
      toast.error("A note is required for manual patient lines");
      return;
    }
    void mutate(
      "new",
      async () => {
        const res = await fetch(apiBase, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payslipEntryId,
            patient: {
              name: "",
              date: new Date().toISOString().slice(0, 10),
              amount: 0,
              status: "paid",
              finance: false,
              note: note.trim(),
            },
          }),
        });
        return res;
      },
      "Patient added"
    );
  };

  const deleteLine = (lineId: string) => {
    setLines((prev) => prev.filter((l) => l.id !== lineId));
    void mutate(
      lineId,
      () =>
        fetch(`${apiBase}?payslipEntryId=${encodeURIComponent(payslipEntryId)}&lineItemId=${encodeURIComponent(lineId)}`, {
          method: "DELETE",
        }),
      "Patient deleted"
    );
  };

  const totals = privatePatientsFooterTotals(lines);

  if (lines.length === 0 && locked) {
    return <p className="text-caption italic text-(--color-text-tertiary)">No individual patients logged.</p>;
  }

  return (
    <div data-testid="private-patients-table">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-caption font-semibold uppercase tracking-wide text-(--color-text-secondary)">
          Private patients ({lines.length})
          {lines.length > 0 ? (
            <span className="ml-2 font-normal normal-case">
              <span className="text-(--color-success)">Paid: {formatMoneyGBPOrDash(totals.paidTotalPence)}</span>
              {totals.outstandingTotalPence > 0 ? (
                <span className="ml-2 text-(--color-danger)">Outstanding: {formatMoneyGBPOrDash(totals.outstandingTotalPence)}</span>
              ) : null}
            </span>
          ) : null}
        </div>
        {!locked ? (
          <button
            type="button"
            className="flex items-center gap-1 text-caption font-medium text-(--color-brand)"
            onClick={addPatient}
            disabled={pendingId === "new"}
          >
            {pendingId === "new" ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
            Add patient
          </button>
        ) : null}
      </div>

      {error ? <p className="mb-2 text-caption text-(--color-danger)">{error}</p> : null}

      {lines.length === 0 ? (
        <p className="text-caption italic text-(--color-text-tertiary)">
          No individual patients logged. Fetch from Dentally or add manually.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-(--radius-md) border border-(--color-border-subtle)">
            <table className="w-full min-w-[820px] text-caption">
              <thead>
                <tr className="border-b border-(--color-border-subtle) bg-(--color-surface-dim)">
                  <th className="px-3 py-2 text-center font-medium text-(--color-text-secondary)">Patient</th>
                <th className="px-3 py-2 text-center font-medium text-(--color-text-secondary)">Date</th>
                <th className="px-3 py-2 text-center font-medium text-(--color-text-secondary)">Amount</th>
                <th className="px-2 py-2 text-center font-medium text-(--color-text-secondary)">Mins</th>
                <th className="px-2 py-2 text-center font-medium text-(--color-text-secondary)">£/hr</th>
                <th className="px-3 py-2 text-center font-medium text-(--color-text-secondary)">Status</th>
                <th className="px-3 py-2 text-center font-medium text-(--color-text-secondary)">Finance</th>
                <th className="px-2 py-2 text-center font-medium text-(--color-text-secondary)">Term</th>
                <th className="px-2 py-2 text-center font-medium text-(--color-text-secondary)">Fee</th>
                <th className="px-2 py-2 text-center font-medium text-(--color-text-secondary)">Source</th>
                {!locked ? <th className="w-10" /> : null}
              </tr>
            </thead>
            <tbody>
              {pageLines.map((line) => {
                const rowClass = line.flagged
                  ? "bg-(--color-warning)/10"
                  : "";
                const busy = pendingId === line.id;
                const needsFinanceInput =
                  line.isFinance &&
                  !isValidFinanceTerm(line.financeTermMonths) &&
                  (line.financeFeePence == null || line.financeFeePence < 0);
                return (
                  <tr key={line.id} className={`border-b border-(--color-border-subtle) last:border-0 ${rowClass}`}>
                    <td className="px-3 py-1.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {line.flagged || needsFinanceInput ? (
                          <AlertCircle className="size-3 shrink-0 text-(--color-warning)" />
                        ) : null}
                        {locked ? (
                          <span>{line.patientName ?? "—"}</span>
                        ) : (
                          <input
                            className="w-full bg-transparent text-center text-caption outline-none"
                            placeholder="Name"
                            value={line.patientName ?? ""}
                            disabled={busy}
                            onBlur={(e) => updateLine(line.id, { name: e.target.value })}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((row) => (row.id === line.id ? { ...row, patientName: e.target.value } : row))
                              )
                            }
                          />
                        )}
                      </div>
                      {line.flagReason && line.flagged ? (
                        <p className="mt-0.5 text-[10px] text-(--color-warning)">{line.flagReason}</p>
                      ) : null}
                      {needsFinanceInput ? (
                        <p className="mt-0.5 text-[10px] text-(--color-warning)">Set term and/or fee</p>
                      ) : null}
                      {line.treatmentDescription ? (
                        <p className="text-[10px] text-(--color-text-tertiary)">{line.treatmentDescription}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {locked ? (
                        line.invoiceDate ?? "—"
                      ) : (
                        <input
                          type="date"
                          className="mx-auto bg-transparent text-center text-caption outline-none"
                          value={line.invoiceDate ?? ""}
                          disabled={busy}
                          onBlur={(e) => updateLine(line.id, { date: e.target.value })}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((row) => (row.id === line.id ? { ...row, invoiceDate: e.target.value } : row))
                            )
                          }
                        />
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-center font-medium">
                      {locked ? (
                        formatMoneyGBPOrDash(line.amountPence)
                      ) : (
                        <input
                          type="number"
                          step="0.01"
                          className="mx-auto w-20 bg-transparent text-center text-caption outline-none"
                          value={penceToPoundsInput(line.amountPence)}
                          disabled={busy}
                          onBlur={(e) => updateLine(line.id, { amount: e.target.value })}
                          onChange={(e) =>
                            setLines((prev) =>
                              prev.map((row) =>
                                row.id === line.id
                                  ? { ...row, amountPence: Math.round((parseFloat(e.target.value) || 0) * 100) }
                                  : row
                              )
                            )
                          }
                        />
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center text-(--color-text-tertiary)">{line.durationMins ?? "—"}</td>
                    <td className={`px-2 py-1.5 text-center ${hourlyRateClass(line.hourlyRatePence)}`}>
                      {line.hourlyRatePence != null ? `£${Math.round(line.hourlyRatePence / 100)}` : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {locked ? (
                        <StatusBadge status={line.paymentStatus} />
                      ) : (
                        <select
                          className="rounded border-0 bg-(--color-surface-dim) px-1 py-0.5 text-[10px] font-medium outline-none"
                          value={line.paymentStatus ?? "paid"}
                          disabled={busy}
                          onChange={(e) => updateLine(line.id, { status: e.target.value }, { successMsg: "Patient updated" })}
                        >
                          <option value="paid">PAID</option>
                          <option value="partial">PARTIAL</option>
                          <option value="unpaid">UNPAID</option>
                        </select>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {locked ? (
                        line.isFinance ? (
                          <span className="rounded bg-(--color-brand)/10 px-1.5 py-0.5 text-[10px] font-medium text-(--color-brand)">FIN</span>
                        ) : (
                          "—"
                        )
                      ) : (
                        <input
                          type="checkbox"
                          className="size-4 rounded"
                          checked={line.isFinance}
                          disabled={busy}
                          onChange={(e) => updateLine(line.id, { finance: e.target.checked }, { successMsg: "Patient updated" })}
                        />
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {line.isFinance ? (
                        locked ? (
                          line.financeTermMonths != null ? `${line.financeTermMonths}m` : "—"
                        ) : (
                          <select
                            className="rounded border border-(--color-brand)/30 bg-transparent px-1 py-0.5 text-[10px] outline-none"
                            value={line.financeTermMonths ?? ""}
                            disabled={busy}
                            onChange={(e) =>
                              updateLine(
                                line.id,
                                {
                                  financeTerm: e.target.value === "" ? null : Number(e.target.value),
                                  financeFeeManual: false,
                                },
                                { successMsg: "Term saved" }
                              )
                            }
                          >
                            <option value="">Term…</option>
                            {FINANCE_TERMS_MONTHS.map((m) => (
                              <option key={m} value={m}>
                                {m}m
                              </option>
                            ))}
                          </select>
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {line.isFinance ? (
                        locked ? (
                          formatMoneyGBPOrDash(line.financeFeePence)
                        ) : (
                          <input
                            type="number"
                            step="0.01"
                            placeholder="0"
                            className="mx-auto w-16 rounded border border-(--color-brand)/30 px-1 py-0.5 text-center text-[10px] outline-none"
                            value={line.financeFeePence != null ? (line.financeFeePence / 100).toFixed(2) : ""}
                            disabled={busy}
                            onBlur={(e) =>
                              updateLine(line.id, {
                                financeFee: e.target.value === "" ? null : e.target.value,
                                financeFeeManual: e.target.value !== "",
                              })
                            }
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((row) =>
                                  row.id === line.id
                                    ? {
                                        ...row,
                                        financeFeePence: Math.round((parseFloat(e.target.value) || 0) * 100),
                                        financeFeeManual: true,
                                      }
                                    : row
                                )
                              )
                            }
                          />
                        )
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center text-[10px] text-(--color-text-tertiary)">
                      <details className="mx-auto max-w-[9rem] text-left" data-testid="line-source">
                        <summary
                          className={
                            isTraceablePrivateLine({
                              dentallyInvoiceId: line.dentallyInvoiceId ?? null,
                              dentallyLineKey: line.dentallyLineKey ?? null,
                              sourceType: (line.sourceType as "DENTALLY" | "MANUAL") || "DENTALLY",
                              manualCreatedByUserId: line.manualCreatedByUserId ?? null,
                              manualNote: line.manualNote ?? null,
                              createdAt: line.createdAt ?? null,
                            })
                              ? "cursor-pointer text-(--color-text-secondary)"
                              : "cursor-pointer text-(--color-warning)"
                          }
                        >
                          {line.sourceType === "MANUAL" || line.manualCreatedByUserId ? "Manual" : "Dentally"}
                        </summary>
                        <p className="mt-1 break-words text-[10px] leading-snug">
                          {formatLineSourceSummary({
                            dentallyInvoiceId: line.dentallyInvoiceId ?? null,
                            dentallyLineKey: line.dentallyLineKey ?? null,
                            sourceType: (line.sourceType as "DENTALLY" | "MANUAL") || "DENTALLY",
                            manualCreatedByUserId: line.manualCreatedByUserId ?? null,
                            manualNote: line.manualNote ?? null,
                            createdAt: line.createdAt ?? null,
                          })}
                        </p>
                      </details>
                    </td>
                    {!locked ? (
                      <td className="px-1 py-1.5">
                        <div className="flex items-center justify-center gap-1">
                          {line.flagged ? (
                            <button
                              type="button"
                              title="Mark as resolved"
                              className="text-(--color-success)"
                              disabled={busy}
                              onClick={() => updateLine(line.id, { resolved: true }, { successMsg: "Marked resolved" })}
                            >
                              <CheckCircle2 className="size-3" />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="text-(--color-text-tertiary) hover:text-(--color-danger)"
                            disabled={busy}
                            onClick={() => setDeleteTarget({ id: line.id, patientName: line.patientName })}
                          >
                            {busy ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-(--color-surface-dim)">
                <td className="px-3 py-2 text-center font-semibold" colSpan={2}>
                  Total ({lines.length} patients)
                </td>
                <td className="px-3 py-2 text-center font-bold">{formatMoneyGBPOrDash(totals.totalAmountPence)}</td>
                <td className="px-2 py-2 text-center text-(--color-text-tertiary)">{totals.totalMins > 0 ? `${totals.totalMins}m` : "—"}</td>
                <td className="px-2 py-2 text-center font-medium text-(--color-success)">
                  {totals.blendedHourlyPence != null ? `£${Math.round(totals.blendedHourlyPence / 100)}` : "—"}
                </td>
                <td className="px-3 py-2 text-center">
                  <span className="text-(--color-success)">{totals.paidCount} paid</span>
                  {totals.reviewCount > 0 ? (
                    <span className="ml-1 text-(--color-warning)">{totals.reviewCount} review</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-center text-(--color-brand)">
                  {totals.financeCount > 0 ? `${totals.financeCount} fin` : "—"}
                </td>
                <td className="px-2 py-2 text-center text-(--color-text-tertiary)">—</td>
                <td className="px-2 py-2 text-center font-medium text-(--color-brand)">
                  {totals.financeFeeTotalPence > 0 ? formatMoneyGBPOrDash(totals.financeFeeTotalPence) : "—"}
                </td>
                <td className="px-2 py-2 text-center text-(--color-text-tertiary)">—</td>
                {!locked ? <td /> : null}
              </tr>
            </tfoot>
            </table>
          </div>
          {showPagination ? (
            <div className="mt-3">
              <TablePagination page={page} pageSize={pageSize} totalCount={totalCount} onPageChange={setPage} />
            </div>
          ) : null}
        </>
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this patient line?"
        description={
          deleteTarget?.patientName
            ? `This removes ${deleteTarget.patientName}'s revenue line from this payslip. This cannot be undone.`
            : "This removes the revenue line from this payslip. This cannot be undone."
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget) deleteLine(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (status === "paid") return <span className="rounded bg-(--color-success)/10 px-1.5 py-0.5 text-[10px] font-medium text-(--color-success)">PAID</span>;
  if (status === "partial") return <span className="rounded bg-(--color-warning)/10 px-1.5 py-0.5 text-[10px] font-medium text-(--color-warning)">PARTIAL</span>;
  if (status === "unpaid") return <span className="rounded bg-(--color-danger)/10 px-1.5 py-0.5 text-[10px] font-medium text-(--color-danger)">UNPAID</span>;
  return <span className="text-(--color-text-tertiary)">—</span>;
}
