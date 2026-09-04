"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, FileText, Loader2, Plus, X } from "lucide-react";
import { formatMoneyGBPOrDash, toast } from "@elio/ui";

export interface NhsDentistOption {
  id: string;
  name: string;
  performerNumber: string | null;
  udaRatePence: number | null;
}

/** Period-level NHS statement upload + manual UDA entry (legacy Y2.8). */
export function NhsStatementPanel({
  payPeriodId,
  locked,
  nhsDentists,
  initialPeriodStart,
  initialPeriodEnd,
}: {
  payPeriodId: string;
  locked: boolean;
  nhsDentists: NhsDentistOption[];
  initialPeriodStart: string | null;
  initialPeriodEnd: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [periodStart, setPeriodStart] = useState(initialPeriodStart ?? "");
  const [periodEnd, setPeriodEnd] = useState(initialPeriodEnd ?? "");
  const [manualUdas, setManualUdas] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [updates, setUpdates] = useState<string[]>([]);

  if (nhsDentists.length === 0 || locked) return null;

  const submit = async () => {
    setPending(true);
    setError(null);
    setMessage(null);
    setUpdates([]);
    try {
      const form = new FormData();
      if (pdfFile) form.append("pdf_file", pdfFile);
      if (periodStart) form.append("nhs_period_start", periodStart);
      if (periodEnd) form.append("nhs_period_end", periodEnd);

      const manual: Record<string, number> = {};
      for (const d of nhsDentists) {
        const raw = manualUdas[d.name]?.trim();
        if (raw) {
          const val = parseFloat(raw);
          if (!Number.isNaN(val) && val > 0) manual[d.name] = val;
        }
      }
      if (Object.keys(manual).length > 0) {
        form.append("manual_udas", JSON.stringify(manual));
      }

      const res = await fetch(`/pay/api/pay-periods/${payPeriodId}/nhs-statement`, {
        method: "POST",
        body: form,
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        updates?: string[];
        period?: { start: string | null; end: string | null };
      };
      if (!res.ok) throw new Error(data.error ?? "NHS statement processing failed");

      const successMsg = data.message ?? "NHS statement applied";
      setMessage(successMsg);
      toast.success(successMsg);
      setUpdates(data.updates ?? []);
      if (data.period?.start) setPeriodStart(data.period.start);
      if (data.period?.end) setPeriodEnd(data.period.end);
      setPdfFile(null);
      setOpen(false);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "NHS statement processing failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      className="rounded-(--radius-lg) border border-(--color-primary-500)/30 bg-(--color-primary-50) p-4"
      data-testid="nhs-statement-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-(--radius-md) bg-(--color-surface)">
            <FileText className="size-5 text-(--color-primary-600)" />
          </div>
          <div>
            <h3 className="text-body-sm font-semibold text-(--color-text-primary)">NHS statement</h3>
            <p className="text-caption text-(--color-text-secondary)">
              Upload FP17 / activity statement PDF or enter UDAs for{" "}
              {nhsDentists.map((d) => d.name).join(", ")}
            </p>
            {initialPeriodStart && initialPeriodEnd ? (
              <p className="mt-0.5 text-caption text-(--color-text-tertiary)">
                NHS period: {initialPeriodStart} – {initialPeriodEnd}
              </p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-(--radius-md) bg-(--color-surface) px-3 py-1.5 text-caption font-medium text-(--color-text-primary) shadow-(--shadow-xs) hover:bg-(--color-bg-subtle)"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
          {open ? "Close" : "Upload statement"}
        </button>
      </div>

      {error ? <p className="mt-2 text-caption text-(--color-danger)">{error}</p> : null}
      {message ? <p className="mt-2 text-caption text-(--color-success)">{message}</p> : null}
      {updates.length > 0 ? (
        <ul className="mt-1 list-inside list-disc text-caption text-(--color-text-secondary)">
          {updates.map((u) => (
            <li key={u}>{u}</li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <div className="mt-4 space-y-4 border-t border-(--color-border-subtle) pt-4">
          <div>
            <label className="mb-2 block text-caption font-medium text-(--color-text-primary)">Upload NHS statement PDF</label>
            <label className="block cursor-pointer">
              <div
                className={`flex items-center justify-center gap-2 rounded-(--radius-md) border-2 border-dashed px-4 py-6 transition ${
                  pdfFile
                    ? "border-(--color-success) bg-(--color-success-bg)"
                    : "border-(--color-border) hover:border-(--color-primary-500) hover:bg-(--color-bg-subtle)"
                }`}
              >
                {pdfFile ? (
                  <>
                    <CheckCircle2 className="size-5 text-(--color-success)" />
                    <span className="text-body-sm font-medium text-(--color-text-primary)">{pdfFile.name}</span>
                    <button
                      type="button"
                      className="ml-2 text-(--color-danger) hover:opacity-80"
                      onClick={(e) => {
                        e.preventDefault();
                        setPdfFile(null);
                      }}
                    >
                      <X className="size-4" />
                    </button>
                  </>
                ) : (
                  <span className="text-body-sm text-(--color-text-secondary)">Click to select NHS statement PDF</span>
                )}
              </div>
              <input
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setPdfFile(file);
                  e.target.value = "";
                }}
              />
            </label>
            <p className="mt-1 text-caption text-(--color-text-tertiary)">
              Auto-extracts UDAs and NHS period dates. Compass upload remains available separately.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-caption font-medium text-(--color-text-primary)">NHS period dates</label>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-caption text-(--color-text-tertiary)">Period start</label>
                <input
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  className="rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-surface) px-3 py-2 text-body-sm outline-none focus:ring-2 focus:ring-(--color-primary-500)/30"
                />
              </div>
              <span className="pb-2 text-caption text-(--color-text-tertiary)">to</span>
              <div>
                <label className="mb-1 block text-caption text-(--color-text-tertiary)">Period end</label>
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  className="rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-surface) px-3 py-2 text-body-sm outline-none focus:ring-2 focus:ring-(--color-primary-500)/30"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-caption font-medium text-(--color-text-primary)">Or enter UDAs manually</label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {nhsDentists.map((d) => (
                <div key={d.id} className="rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-surface) p-3">
                  <label className="mb-1 block text-caption font-medium text-(--color-text-primary)">
                    {d.name}
                    <span className="ml-1 text-(--color-text-tertiary)">
                      ({formatMoneyGBPOrDash(d.udaRatePence)}/UDA)
                    </span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    value={manualUdas[d.name] ?? ""}
                    onChange={(e) => setManualUdas((prev) => ({ ...prev, [d.name]: e.target.value }))}
                    className="w-full rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-surface) px-3 py-2 text-body-sm outline-none focus:ring-2 focus:ring-(--color-primary-500)/30"
                  />
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={pending || (!pdfFile && !Object.values(manualUdas).some((v) => v.trim()))}
            className="flex items-center gap-2 rounded-(--radius-md) bg-(--color-primary-600) px-4 py-2 text-body-sm font-semibold text-white disabled:opacity-50"
            onClick={() => void submit()}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            Apply NHS statement
          </button>
        </div>
      ) : null}
    </div>
  );
}
