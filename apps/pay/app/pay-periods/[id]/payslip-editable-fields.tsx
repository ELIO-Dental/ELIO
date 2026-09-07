"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Plus, Save, Trash2, Undo2 } from "lucide-react";
import { Button, toast } from "@elio/ui";
import {
  parsePayslipAdjustments,
  parsePayslipLabBills,
  type PayslipAdjustment,
  type PayslipLabBill,
} from "@/lib/payslip-editable-fields";
import { DEFAULT_THERAPY_RATE_PER_MINUTE } from "@/lib/private-revenue";

function penceToPounds(pence: number | null): string {
  if (pence == null) return "";
  return (pence / 100).toFixed(2);
}

function poundsToNumber(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** AuraPay always shows a rate (default £0.5833/min = £35/hr). */
function displayTherapyRate(value: number | null): string {
  if (value != null && value > 0) return String(value);
  return String(DEFAULT_THERAPY_RATE_PER_MINUTE);
}

interface FormSnapshot {
  therapyMins: string;
  therapyRate: string;
  superannuation: string;
  grossPrivate: string;
  financeFees: string;
  notes: string;
  nhsUdas: string;
  labBills: PayslipLabBill[];
  adjustments: PayslipAdjustment[];
}

const MAX_UNDO = 10;

/** Editable draft payslip deductions (legacy Y2.9). */
export function PayslipEditableFields({
  payPeriodId,
  payslipEntryId,
  locked,
  isNhs,
  hasPatientLines,
  udas,
  udaRatePence,
  therapyMinutes,
  therapyRatePerMinute,
  superannuationPence,
  grossPrivateRevenuePence,
  financeFeesPence,
  adjustmentReason,
  labBillsJson,
  adjustmentsJson,
}: {
  payPeriodId: string;
  payslipEntryId: string;
  locked: boolean;
  isNhs: boolean;
  hasPatientLines: boolean;
  udas: string | null;
  udaRatePence?: number | null;
  therapyMinutes: number | null;
  therapyRatePerMinute: number | null;
  superannuationPence: number | null;
  grossPrivateRevenuePence: number | null;
  financeFeesPence: number | null;
  adjustmentReason: string | null;
  labBillsJson: unknown;
  adjustmentsJson: unknown;
}) {
  const router = useRouter();
  const [therapyMins, setTherapyMins] = useState(therapyMinutes?.toString() ?? "");
  const [therapyRate, setTherapyRate] = useState(displayTherapyRate(therapyRatePerMinute));
  const [superannuation, setSuperannuation] = useState(penceToPounds(superannuationPence));
  const [grossPrivate, setGrossPrivate] = useState(penceToPounds(grossPrivateRevenuePence));
  const [financeFees, setFinanceFees] = useState(penceToPounds(financeFeesPence));
  const [notes, setNotes] = useState(adjustmentReason ?? "");
  const [nhsUdas, setNhsUdas] = useState(udas ?? "");
  const [labBills, setLabBills] = useState<PayslipLabBill[]>(() => parsePayslipLabBills(labBillsJson));
  const [adjustments, setAdjustments] = useState<PayslipAdjustment[]>(() => parsePayslipAdjustments(adjustmentsJson));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<FormSnapshot[]>([]);
  const skipNextPropSync = useRef(false);

  const captureSnapshot = (): FormSnapshot => ({
    therapyMins,
    therapyRate,
    superannuation,
    grossPrivate,
    financeFees,
    notes,
    nhsUdas,
    labBills: labBills.map((b) => ({ ...b })),
    adjustments: adjustments.map((a) => ({ ...a })),
  });

  const pushUndo = () => {
    setUndoStack((prev) => [...prev, captureSnapshot()].slice(-MAX_UNDO));
  };

  const undo = () => {
    if (undoStack.length === 0) return;
    const snapshot = undoStack[undoStack.length - 1]!;
    setUndoStack((prev) => prev.slice(0, -1));
    setTherapyMins(snapshot.therapyMins);
    setTherapyRate(snapshot.therapyRate);
    setSuperannuation(snapshot.superannuation);
    setGrossPrivate(snapshot.grossPrivate);
    setFinanceFees(snapshot.financeFees);
    setNotes(snapshot.notes);
    setNhsUdas(snapshot.nhsUdas);
    setLabBills(snapshot.labBills.map((b) => ({ ...b })));
    setAdjustments(snapshot.adjustments.map((a) => ({ ...a })));
    toast.success("Change undone");
  };

  useEffect(() => {
    if (skipNextPropSync.current) {
      skipNextPropSync.current = false;
      return;
    }
    setTherapyMins(therapyMinutes?.toString() ?? "");
    setTherapyRate(displayTherapyRate(therapyRatePerMinute));
    setSuperannuation(penceToPounds(superannuationPence));
    setGrossPrivate(penceToPounds(grossPrivateRevenuePence));
    setFinanceFees(penceToPounds(financeFeesPence));
    setNotes(adjustmentReason ?? "");
    setNhsUdas(udas ?? "");
    setLabBills(parsePayslipLabBills(labBillsJson));
    setAdjustments(parsePayslipAdjustments(adjustmentsJson));
    setUndoStack([]);
  }, [
    therapyMinutes,
    therapyRatePerMinute,
    superannuationPence,
    grossPrivateRevenuePence,
    financeFeesPence,
    adjustmentReason,
    udas,
    labBillsJson,
    adjustmentsJson,
  ]);

  const fieldDisabled = locked;
  const grossFinanceLocked = locked || hasPatientLines;
  const inputClass =
    "w-full rounded-(--radius-md) border border-(--color-border-subtle) px-3 py-2 text-body-sm outline-none focus:ring-2 focus:ring-(--color-brand)/30 disabled:bg-(--color-surface-dim) disabled:text-(--color-text-secondary)";

  const save = async () => {
    if (locked) return;
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const body: Record<string, unknown> = {
        payslipEntryId,
        therapy_minutes: therapyMins ? Number(therapyMins) : 0,
        therapy_rate:
          therapyRate.trim() !== "" ? Number(therapyRate) : DEFAULT_THERAPY_RATE_PER_MINUTE,
        superannuation_deduction: poundsToNumber(superannuation),
        lab_bills: labBills.filter((b) => b.amount > 0 || b.lab_name.trim()),
        adjustments: adjustments
          .filter((a) => a.amount > 0 || a.description.trim())
          .map((a) => ({
            description: a.description.trim(),
            amount: a.amount,
            amountPence: Math.round(a.amount * 100),
            type: a.type,
            createdBy: a.createdBy ?? undefined,
            createdAt: a.createdAt ?? undefined,
          })),
      };
      const missingNote = (body.adjustments as PayslipAdjustment[]).find(
        (a) => a.amountPence > 0 && !a.description.trim()
      );
      if (missingNote) throw new Error("Each adjustment requires a note");
      if (isNhs && nhsUdas) body.nhs_udas = Number(nhsUdas);
      if (!hasPatientLines) {
        body.gross_private = poundsToNumber(grossPrivate);
        body.finance_fees = poundsToNumber(financeFees);
      }
      if (notes.trim()) body.notes = notes.trim();

      const res = await fetch(`/pay/api/pay-periods/${payPeriodId}/entries`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setMessage("Payslip updated");
      toast.success("Payslip updated — Run calculation to refresh totals");
      skipNextPropSync.current = true;
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setPending(false);
    }
  };

  return (
    <section
      className="rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-surface) p-4 shadow-sm"
      data-testid="payslip-editable-fields"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-caption font-semibold uppercase tracking-wide text-(--color-text-secondary)">
            Payslip figures
          </h4>
          <p className="mt-0.5 text-caption text-(--color-text-tertiary)">
            {locked
              ? "Period finalized — figures are read-only"
              : "Gross, finance, therapy, lab bills, and adjustments"}
          </p>
        </div>
        {!locked ? (
          <div className="flex flex-wrap items-center gap-2">
            {undoStack.length > 0 ? (
              <Button type="button" size="sm" variant="outline" onClick={undo} data-testid="payslip-undo">
                <Undo2 className="size-3" />
                Undo ({undoStack.length})
              </Button>
            ) : null}
            <Button type="button" size="sm" loading={pending} onClick={() => void save()}>
              <Save className="size-3" />
              Save
            </Button>
          </div>
        ) : null}
      </div>

      {error ? <p className="mb-3 text-caption text-(--color-danger)">{error}</p> : null}
      {message ? <p className="mb-3 text-caption text-(--color-success)">{message}</p> : null}

      <div className="space-y-5">
        {/* AuraPay: always show Gross + Finance (disabled when from patients / locked) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-caption font-medium text-(--color-text-secondary)">
              Gross Private Income
              {hasPatientLines ? (
                <span className="ml-1 text-[10px] text-(--color-text-tertiary)">(from patients)</span>
              ) : null}
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-caption text-(--color-text-tertiary)">
                £
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={grossPrivate}
                onChange={(e) => setGrossPrivate(e.target.value)}
                disabled={grossFinanceLocked}
                className={`${inputClass} pl-7`}
                data-testid="payslip-gross-private"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-caption font-medium text-(--color-text-secondary)">
              Finance Fees Total
              {hasPatientLines ? (
                <span className="ml-1 text-[10px] text-(--color-text-tertiary)">(from patients)</span>
              ) : null}
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-caption text-(--color-text-tertiary)">
                £
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={financeFees}
                onChange={(e) => setFinanceFees(e.target.value)}
                disabled={grossFinanceLocked}
                className={`${inputClass} pl-7`}
                data-testid="payslip-finance-fees"
              />
            </div>
          </div>
        </div>

        {isNhs ? (
          <div className="max-w-xs">
            <label className="mb-1 block text-caption font-medium text-(--color-text-secondary)">
              NHS UDAs{udaRatePence != null && udaRatePence > 0 ? ` (× £${(udaRatePence / 100).toFixed(2)})` : ""}
            </label>
            <input
              type="number"
              step="0.01"
              value={nhsUdas}
              onChange={(e) => setNhsUdas(e.target.value)}
              disabled={fieldDisabled}
              className={inputClass}
            />
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-caption font-medium text-(--color-text-secondary)">
              Therapy Minutes
            </label>
            <input
              type="number"
              min="0"
              value={therapyMins}
              onChange={(e) => setTherapyMins(e.target.value)}
              placeholder="0"
              disabled={fieldDisabled}
              className={inputClass}
              data-testid="payslip-therapy-minutes"
            />
          </div>
          <div>
            <label className="mb-1 block text-caption font-medium text-(--color-text-secondary)">
              Rate per Minute
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-caption text-(--color-text-tertiary)">
                £
              </span>
              <input
                type="number"
                step="0.0001"
                min="0"
                value={therapyRate}
                onChange={(e) => setTherapyRate(e.target.value)}
                disabled={fieldDisabled}
                className={`${inputClass} pl-7`}
                data-testid="payslip-therapy-rate"
              />
            </div>
            <p className="mt-1 text-[10px] text-(--color-text-tertiary)">
              Default £{DEFAULT_THERAPY_RATE_PER_MINUTE}/min (£35/hr)
            </p>
          </div>
        </div>

        <div className="max-w-xs">
          <label className="mb-1 block text-caption font-medium text-(--color-text-secondary)">
            Superannuation Deduction
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-caption text-(--color-text-tertiary)">
              £
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={superannuation}
              onChange={(e) => setSuperannuation(e.target.value)}
              disabled={fieldDisabled}
              className={`${inputClass} pl-7`}
              data-testid="payslip-superannuation"
            />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-caption font-semibold uppercase tracking-wide text-(--color-text-secondary)">Lab bills</label>
            {!locked ? (
            <button
              type="button"
              className="flex items-center gap-1 text-caption font-medium text-(--color-brand)"
              onClick={() => {
                pushUndo();
                setLabBills((prev) => [...prev, { lab_name: "", amount: 0 }]);
              }}
            >
              <Plus className="size-3" /> Add Lab Bill
            </button>
            ) : null}
          </div>
          {labBills.length === 0 ? (
            <p className="text-caption text-(--color-text-tertiary) italic">No lab bills added</p>
          ) : (
            <div className="space-y-2">
              {labBills.map((bill, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder="Lab name"
                    value={bill.lab_name}
                    disabled={fieldDisabled}
                    onChange={(e) => {
                      const next = [...labBills];
                      next[i] = { ...bill, lab_name: e.target.value };
                      setLabBills(next);
                    }}
                    className={`min-w-32 flex-1 ${inputClass}`}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Amount"
                    value={bill.amount || ""}
                    disabled={fieldDisabled}
                    onChange={(e) => {
                      const next = [...labBills];
                      next[i] = { ...bill, amount: poundsToNumber(e.target.value) };
                      setLabBills(next);
                    }}
                    className={`w-28 ${inputClass}`}
                  />
                  <input
                    type="url"
                    placeholder="Bill link (URL)"
                    value={bill.file_url ?? ""}
                    disabled={fieldDisabled}
                    onChange={(e) => {
                      const next = [...labBills];
                      next[i] = { ...bill, file_url: e.target.value || undefined };
                      setLabBills(next);
                    }}
                    className={`min-w-40 flex-1 ${inputClass}`}
                  />
                  {!locked ? (
                  <label className="cursor-pointer rounded-(--radius-md) border border-(--color-border-subtle) px-2 py-2 text-caption text-(--color-brand) hover:bg-(--color-surface-dim)">
                    Upload
                    <input
                      type="file"
                      accept=".pdf,image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        try {
                          const form = new FormData();
                          form.append("file", file);
                          form.append("entity_name", bill.lab_name || "lab");
                          form.append("payslipEntryId", payslipEntryId);
                          const res = await fetch(`/pay/api/pay-periods/${payPeriodId}/lab-bill-upload`, {
                            method: "POST",
                            body: form,
                          });
                          const data = (await res.json().catch(() => ({}))) as {
                            error?: string;
                            fileUrl?: string;
                          };
                          if (!res.ok || !data.fileUrl) {
                            throw new Error(data.error ?? "Upload failed");
                          }
                          pushUndo();
                          const next = [...labBills];
                          next[i] = { ...bill, file_url: data.fileUrl };
                          setLabBills(next);
                          toast.success("Lab bill uploaded");
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Upload failed");
                        }
                      }}
                    />
                  </label>
                  ) : null}
                  {bill.file_url ? (
                    <a
                      href={bill.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-caption text-(--color-brand) underline"
                    >
                      View bill
                    </a>
                  ) : null}
                  {!locked ? (
                  <button
                    type="button"
                    className="text-(--color-danger)"
                    onClick={() => {
                      pushUndo();
                      setLabBills((prev) => prev.filter((_, j) => j !== i));
                    }}
                    aria-label="Remove lab bill"
                  >
                    <Trash2 className="size-4" />
                  </button>
                  ) : null}
                </div>
              ))}
              {(() => {
                const total = labBills.reduce((s, b) => s + (Number(b.amount) || 0), 0);
                const dentistShare = Math.round(total * 50) / 100;
                return total > 0 ? (
                  <p className="text-caption text-(--color-text-secondary)">
                    Total: £{total.toFixed(2)} (Dentist pays 50%: £{dentistShare.toFixed(2)})
                  </p>
                ) : null;
              })()}
            </div>
          )}
          {hasPatientLines ? (
            <p className="mt-1 text-caption text-(--color-text-tertiary)">
              Gross private and finance fees are derived from private patient lines.
            </p>
          ) : null}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-caption font-semibold uppercase tracking-wide text-(--color-text-secondary)">
              Adjustments
            </label>
            {!locked ? (
            <button
              type="button"
              className="flex items-center gap-1 text-caption font-medium text-(--color-brand)"
              onClick={() => {
                pushUndo();
                setAdjustments((prev) => [
                  ...prev,
                  { description: "", amount: 0, amountPence: 0, type: "deduction" },
                ]);
              }}
            >
              <Plus className="size-3" /> Add Adjustment
            </button>
            ) : null}
          </div>
          {adjustments.length === 0 ? (
            <p className="text-caption text-(--color-text-tertiary) italic">No adjustments</p>
          ) : (
            <div className="space-y-2">
              {adjustments.map((adj, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder="Description (required)"
                    required
                    value={adj.description}
                    disabled={fieldDisabled}
                    onChange={(e) => {
                      const next = [...adjustments];
                      next[i] = { ...adj, description: e.target.value };
                      setAdjustments(next);
                    }}
                    className={`min-w-32 flex-1 ${inputClass}`}
                  />
                  <select
                    value={adj.type}
                    disabled={fieldDisabled}
                    onChange={(e) => {
                      const next = [...adjustments];
                      next[i] = { ...adj, type: e.target.value as PayslipAdjustment["type"] };
                      setAdjustments(next);
                    }}
                    className={inputClass}
                  >
                    <option value="deduction">Deduction (−)</option>
                    <option value="addition">Addition (+)</option>
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="£"
                    value={adj.amount || ""}
                    disabled={fieldDisabled}
                    onChange={(e) => {
                      const pounds = poundsToNumber(e.target.value);
                      const next = [...adjustments];
                      next[i] = {
                        ...adj,
                        amount: pounds,
                        amountPence: Math.round(pounds * 100),
                      };
                      setAdjustments(next);
                    }}
                    className={`w-28 ${inputClass}`}
                  />
                  {!locked ? (
                  <button
                    type="button"
                    className="text-(--color-danger)"
                    onClick={() => {
                      pushUndo();
                      setAdjustments((prev) => prev.filter((_, j) => j !== i));
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="mb-1 block text-caption font-medium text-(--color-text-secondary)">Notes</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={fieldDisabled}
            placeholder="Any notes for this payslip..."
            className={`${inputClass} resize-none`}
          />
        </div>
      </div>
    </section>
  );
}
