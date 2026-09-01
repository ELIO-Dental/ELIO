"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Plus, Trash2, AlertCircle } from "lucide-react";
import { formatMoneyGBPOrDash } from "@elio/ui";
import { privatePatientsFooterTotals } from "@/lib/private-patients-table-format";

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
  flagged: boolean;
  flagReason: string | null;
  treatmentDescription: string | null;
}

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

/** Interactive private patients table (legacy Y2.5). */
export function PrivatePatientsTable({
  payPeriodId,
  payslipEntryId,
  locked,
  initialLines,
}: {
  payPeriodId: string;
  payslipEntryId: string;
  locked: boolean;
  initialLines: PrivatePatientRow[];
}) {
  const router = useRouter();
  const [lines, setLines] = useState(initialLines);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLines(initialLines);
  }, [initialLines]);

  const apiBase = `/pay/api/pay-periods/${payPeriodId}/patients`;

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const mutate = useCallback(
    async (lineId: string, fn: () => Promise<Response>) => {
      setPendingId(lineId);
      setError(null);
      try {
        const res = await fn();
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Request failed");
        refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Request failed");
      } finally {
        setPendingId(null);
      }
    },
    [refresh]
  );

  const updateLine = useCallback(
    (lineId: string, updates: Record<string, unknown>, options?: { optimistic?: boolean }) => {
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
            if (updates.financeFee != null) next.financeFeePence = Math.round(Number(updates.financeFee) * 100);
            if (updates.resolved === true) {
              next.flagged = false;
              next.flagReason = null;
            }
            return next;
          })
        );
      }

      void mutate(lineId, () =>
        fetch(apiBase, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payslipEntryId, lineItemId: lineId, updates }),
        })
      );
    },
    [apiBase, mutate, payslipEntryId]
  );

  const addPatient = () => {
    void mutate("new", async () => {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payslipEntryId,
          patient: { name: "", date: new Date().toISOString().slice(0, 10), amount: 0, status: "paid", finance: false },
        }),
      });
      return res;
    });
  };

  const deleteLine = (lineId: string) => {
    setLines((prev) => prev.filter((l) => l.id !== lineId));
    void mutate(lineId, () =>
      fetch(`${apiBase}?payslipEntryId=${encodeURIComponent(payslipEntryId)}&lineItemId=${encodeURIComponent(lineId)}`, {
        method: "DELETE",
      })
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
        <div className="overflow-x-auto rounded-(--radius-md) border border-(--color-border-subtle)">
          <table className="w-full text-caption">
            <thead>
              <tr className="border-b border-(--color-border-subtle) bg-(--color-surface-dim)">
                <th className="px-3 py-2 text-left font-medium text-(--color-text-secondary)">Patient</th>
                <th className="px-3 py-2 text-left font-medium text-(--color-text-secondary)">Date</th>
                <th className="px-3 py-2 text-right font-medium text-(--color-text-secondary)">Amount</th>
                <th className="px-2 py-2 text-center font-medium text-(--color-text-secondary)">Mins</th>
                <th className="px-2 py-2 text-right font-medium text-(--color-text-secondary)">£/hr</th>
                <th className="px-3 py-2 text-center font-medium text-(--color-text-secondary)">Status</th>
                <th className="px-3 py-2 text-center font-medium text-(--color-text-secondary)">Finance</th>
                <th className="px-2 py-2 text-right font-medium text-(--color-text-secondary)">Fee</th>
                {!locked ? <th className="w-10" /> : null}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const rowClass = line.flagged
                  ? "bg-(--color-warning)/10"
                  : "";
                const busy = pendingId === line.id;
                return (
                  <tr key={line.id} className={`border-b border-(--color-border-subtle) last:border-0 ${rowClass}`}>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-1">
                        {line.flagged ? <AlertCircle className="size-3 shrink-0 text-(--color-warning)" /> : null}
                        {locked ? (
                          <span>{line.patientName ?? "—"}</span>
                        ) : (
                          <input
                            className="w-full bg-transparent text-caption outline-none"
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
                        <p className="mt-0.5 pl-4 text-[10px] text-(--color-warning)">{line.flagReason}</p>
                      ) : null}
                      {line.treatmentDescription ? (
                        <p className="text-[10px] text-(--color-text-tertiary)">{line.treatmentDescription}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-1.5">
                      {locked ? (
                        line.invoiceDate ?? "—"
                      ) : (
                        <input
                          type="date"
                          className="w-full bg-transparent text-caption outline-none"
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
                    <td className="px-3 py-1.5 text-right font-medium">
                      {locked ? (
                        formatMoneyGBPOrDash(line.amountPence)
                      ) : (
                        <input
                          type="number"
                          step="0.01"
                          className="w-20 bg-transparent text-right text-caption outline-none"
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
                    <td className={`px-2 py-1.5 text-right ${hourlyRateClass(line.hourlyRatePence)}`}>
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
                          onChange={(e) => updateLine(line.id, { status: e.target.value })}
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
                          onChange={(e) => updateLine(line.id, { finance: e.target.checked })}
                        />
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {line.isFinance ? (
                        locked ? (
                          formatMoneyGBPOrDash(line.financeFeePence)
                        ) : (
                          <input
                            type="number"
                            step="0.01"
                            placeholder="0"
                            className="w-16 rounded border border-(--color-brand)/30 px-1 py-0.5 text-right text-[10px] outline-none"
                            value={line.financeFeePence != null ? (line.financeFeePence / 100).toFixed(2) : ""}
                            disabled={busy}
                            onBlur={(e) => updateLine(line.id, { financeFee: e.target.value })}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((row) =>
                                  row.id === line.id
                                    ? { ...row, financeFeePence: Math.round((parseFloat(e.target.value) || 0) * 100) }
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
                    {!locked ? (
                      <td className="px-1 py-1.5">
                        <div className="flex items-center gap-1">
                          {line.flagged ? (
                            <button
                              type="button"
                              title="Mark as resolved"
                              className="text-(--color-success)"
                              disabled={busy}
                              onClick={() => updateLine(line.id, { resolved: true })}
                            >
                              <CheckCircle2 className="size-3" />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="text-(--color-text-tertiary) hover:text-(--color-danger)"
                            disabled={busy}
                            onClick={() => deleteLine(line.id)}
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
                <td className="px-3 py-2 font-semibold" colSpan={2}>
                  Total ({lines.length} patients)
                </td>
                <td className="px-3 py-2 text-right font-bold">{formatMoneyGBPOrDash(totals.totalAmountPence)}</td>
                <td className="px-2 py-2 text-center text-(--color-text-tertiary)">{totals.totalMins > 0 ? `${totals.totalMins}m` : "—"}</td>
                <td className="px-2 py-2 text-right font-medium text-(--color-success)">
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
                <td className="px-2 py-2 text-right font-medium text-(--color-brand)">
                  {totals.financeFeeTotalPence > 0 ? formatMoneyGBPOrDash(totals.financeFeeTotalPence) : "—"}
                </td>
                {!locked ? <td /> : null}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (status === "paid") return <span className="rounded bg-(--color-success)/10 px-1.5 py-0.5 text-[10px] font-medium text-(--color-success)">PAID</span>;
  if (status === "partial") return <span className="rounded bg-(--color-warning)/10 px-1.5 py-0.5 text-[10px] font-medium text-(--color-warning)">PARTIAL</span>;
  if (status === "unpaid") return <span className="rounded bg-(--color-danger)/10 px-1.5 py-0.5 text-[10px] font-medium text-(--color-danger)">UNPAID</span>;
  return <span className="text-(--color-text-tertiary)">—</span>;
}
