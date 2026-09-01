"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import {
  parsePayslipAdjustments,
  parsePayslipLabBills,
  type PayslipAdjustment,
  type PayslipLabBill,
} from "@/lib/payslip-editable-fields";

function penceToPounds(pence: number | null): string {
  if (pence == null) return "";
  return (pence / 100).toFixed(2);
}

function poundsToNumber(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** Editable draft payslip deductions (legacy Y2.9). */
export function PayslipEditableFields({
  payPeriodId,
  payslipEntryId,
  locked,
  isNhs,
  hasPatientLines,
  udas,
  therapyMinutes,
  therapyRatePerMinute,
  superannuationPence,
  labBillsJson,
  adjustmentsJson,
}: {
  payPeriodId: string;
  payslipEntryId: string;
  locked: boolean;
  isNhs: boolean;
  hasPatientLines: boolean;
  udas: string | null;
  therapyMinutes: number | null;
  therapyRatePerMinute: number | null;
  superannuationPence: number | null;
  labBillsJson: unknown;
  adjustmentsJson: unknown;
}) {
  const router = useRouter();
  const [therapyMins, setTherapyMins] = useState(therapyMinutes?.toString() ?? "");
  const [therapyRate, setTherapyRate] = useState(therapyRatePerMinute?.toString() ?? "0.5833");
  const [superannuation, setSuperannuation] = useState(penceToPounds(superannuationPence));
  const [nhsUdas, setNhsUdas] = useState(udas ?? "");
  const [labBills, setLabBills] = useState<PayslipLabBill[]>(() => parsePayslipLabBills(labBillsJson));
  const [adjustments, setAdjustments] = useState<PayslipAdjustment[]>(() => parsePayslipAdjustments(adjustmentsJson));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setTherapyMins(therapyMinutes?.toString() ?? "");
    setTherapyRate(therapyRatePerMinute?.toString() ?? "0.5833");
    setSuperannuation(penceToPounds(superannuationPence));
    setNhsUdas(udas ?? "");
    setLabBills(parsePayslipLabBills(labBillsJson));
    setAdjustments(parsePayslipAdjustments(adjustmentsJson));
  }, [
    therapyMinutes,
    therapyRatePerMinute,
    superannuationPence,
    udas,
    labBillsJson,
    adjustmentsJson,
  ]);

  if (locked) return null;

  const save = async () => {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const body: Record<string, unknown> = {
        payslipEntryId,
        therapy_minutes: therapyMins ? Number(therapyMins) : 0,
        therapy_rate: therapyRate ? Number(therapyRate) : 0.5833,
        superannuation_deduction: poundsToNumber(superannuation),
        lab_bills: labBills.filter((b) => b.amount > 0 || b.lab_name.trim()),
        adjustments: adjustments.filter((a) => a.amount > 0 || a.description.trim()),
      };
      if (isNhs && nhsUdas) body.nhs_udas = Number(nhsUdas);

      const res = await fetch(`/pay/api/pay-periods/${payPeriodId}/entries`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setMessage("Payslip updated");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
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
            Editable figures
          </h4>
          <p className="mt-0.5 text-caption text-(--color-text-tertiary)">
            Therapy, superannuation, lab bills, and manual adjustments while the period is in draft
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => void save()}
          className="flex items-center gap-1.5 rounded-(--radius-md) bg-(--color-brand) px-3 py-1.5 text-caption font-semibold text-white disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
          Save changes
        </button>
      </div>

      {error ? <p className="mb-3 text-caption text-(--color-danger)">{error}</p> : null}
      {message ? <p className="mb-3 text-caption text-(--color-success)">{message}</p> : null}

      <div className="space-y-5">
        {isNhs ? (
          <div className="max-w-xs">
            <label className="mb-1 block text-caption font-medium text-(--color-text-secondary)">NHS UDAs</label>
            <input
              type="number"
              step="0.01"
              value={nhsUdas}
              onChange={(e) => setNhsUdas(e.target.value)}
              className="w-full rounded-(--radius-md) border border-(--color-border-subtle) px-3 py-2 text-body-sm outline-none focus:ring-2 focus:ring-(--color-brand)/30"
            />
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-caption font-medium text-(--color-text-secondary)">Therapy minutes</label>
            <input
              type="number"
              min="0"
              value={therapyMins}
              onChange={(e) => setTherapyMins(e.target.value)}
              className="w-full rounded-(--radius-md) border border-(--color-border-subtle) px-3 py-2 text-body-sm outline-none focus:ring-2 focus:ring-(--color-brand)/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-caption font-medium text-(--color-text-secondary)">Rate per minute (£)</label>
            <input
              type="number"
              step="0.0001"
              min="0"
              value={therapyRate}
              onChange={(e) => setTherapyRate(e.target.value)}
              className="w-full rounded-(--radius-md) border border-(--color-border-subtle) px-3 py-2 text-body-sm outline-none focus:ring-2 focus:ring-(--color-brand)/30"
            />
          </div>
        </div>

        <div className="max-w-xs">
          <label className="mb-1 block text-caption font-medium text-(--color-text-secondary)">Superannuation deduction (£)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={superannuation}
            onChange={(e) => setSuperannuation(e.target.value)}
            className="w-full rounded-(--radius-md) border border-(--color-border-subtle) px-3 py-2 text-body-sm outline-none focus:ring-2 focus:ring-(--color-brand)/30"
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-caption font-semibold uppercase tracking-wide text-(--color-text-secondary)">Lab bills</label>
            <button
              type="button"
              className="flex items-center gap-1 text-caption font-medium text-(--color-brand)"
              onClick={() => setLabBills((prev) => [...prev, { lab_name: "", amount: 0 }])}
            >
              <Plus className="size-3" /> Add lab bill
            </button>
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
                    onChange={(e) => {
                      const next = [...labBills];
                      next[i] = { ...bill, lab_name: e.target.value };
                      setLabBills(next);
                    }}
                    className="min-w-32 flex-1 rounded-(--radius-md) border border-(--color-border-subtle) px-3 py-2 text-body-sm"
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Amount"
                    value={bill.amount || ""}
                    onChange={(e) => {
                      const next = [...labBills];
                      next[i] = { ...bill, amount: poundsToNumber(e.target.value) };
                      setLabBills(next);
                    }}
                    className="w-28 rounded-(--radius-md) border border-(--color-border-subtle) px-3 py-2 text-body-sm"
                  />
                  <button
                    type="button"
                    className="text-(--color-danger)"
                    onClick={() => setLabBills((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {hasPatientLines ? (
            <p className="mt-1 text-caption text-(--color-text-tertiary)">
              Gross private and finance fees are derived from patient lines above.
            </p>
          ) : null}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-caption font-semibold uppercase tracking-wide text-(--color-text-secondary)">
              Manual adjustments
            </label>
            <button
              type="button"
              className="flex items-center gap-1 text-caption font-medium text-(--color-brand)"
              onClick={() =>
                setAdjustments((prev) => [...prev, { description: "", amount: 0, type: "deduction" }])
              }
            >
              <Plus className="size-3" /> Add adjustment
            </button>
          </div>
          {adjustments.length === 0 ? (
            <p className="text-caption text-(--color-text-tertiary) italic">No adjustments</p>
          ) : (
            <div className="space-y-2">
              {adjustments.map((adj, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder="Description"
                    value={adj.description}
                    onChange={(e) => {
                      const next = [...adjustments];
                      next[i] = { ...adj, description: e.target.value };
                      setAdjustments(next);
                    }}
                    className="min-w-32 flex-1 rounded-(--radius-md) border border-(--color-border-subtle) px-3 py-2 text-body-sm"
                  />
                  <select
                    value={adj.type}
                    onChange={(e) => {
                      const next = [...adjustments];
                      next[i] = { ...adj, type: e.target.value as PayslipAdjustment["type"] };
                      setAdjustments(next);
                    }}
                    className="rounded-(--radius-md) border border-(--color-border-subtle) px-2 py-2 text-body-sm"
                  >
                    <option value="deduction">Deduction</option>
                    <option value="addition">Addition</option>
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="£"
                    value={adj.amount || ""}
                    onChange={(e) => {
                      const next = [...adjustments];
                      next[i] = { ...adj, amount: poundsToNumber(e.target.value) };
                      setAdjustments(next);
                    }}
                    className="w-28 rounded-(--radius-md) border border-(--color-border-subtle) px-3 py-2 text-body-sm"
                  />
                  <button
                    type="button"
                    className="text-(--color-danger)"
                    onClick={() => setAdjustments((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
