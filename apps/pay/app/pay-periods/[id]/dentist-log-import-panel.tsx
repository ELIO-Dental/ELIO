"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { formatMoneyGBPOrDash } from "@elio/ui";
import { parseDentistLogJson, type DentistLogEntry } from "@/lib/dentist-log-compare";

/** Dentist private log CSV / sheet import (legacy Y2.7). */
export function DentistLogImportPanel({
  payPeriodId,
  payslipEntryId,
  dentistName,
  locked,
  initialLog,
}: {
  payPeriodId: string;
  payslipEntryId: string;
  dentistName: string;
  locked: boolean;
  initialLog: unknown;
}) {
  const router = useRouter();
  const [showPaste, setShowPaste] = useState(false);
  const [csv, setCsv] = useState("");
  const [log, setLog] = useState<DentistLogEntry[]>(() => parseDentistLogJson(initialLog));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setLog(parseDentistLogJson(initialLog));
  }, [initialLog]);

  if (locked) return null;

  const apiBase = `/pay/api/pay-periods/${payPeriodId}/dentist-log`;

  const importCsv = async (csvData: string) => {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payslipEntryId, csv_data: csvData }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setMessage(data.message ?? "Log imported");
      setShowPaste(false);
      setCsv("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setPending(false);
    }
  };

  const onFile = async (file: File) => {
    const text = await file.text();
    await importCsv(text);
  };

  const onGoogleSheets = () => {
    setError("Google Sheets import requires GOOGLE_SERVICE_ACCOUNT_JSON — use CSV upload or paste for now.");
  };

  return (
    <section
      className="rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-surface) p-4 shadow-sm"
      data-testid="dentist-log-import-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-caption font-semibold uppercase tracking-wide text-(--color-text-secondary)">
            Dentist private log
          </h4>
          <p className="mt-0.5 text-caption text-(--color-text-tertiary)">
            Upload a spreadsheet or paste CSV to cross-reference with Dentally data for {dentistName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label
            className={`flex cursor-pointer items-center gap-1.5 rounded-(--radius-md) border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-caption font-medium text-emerald-700 hover:bg-emerald-100 ${pending ? "pointer-events-none opacity-50" : ""}`}
          >
            {pending ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
            Upload sheet
            <input
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
              className="hidden"
              disabled={pending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFile(file);
                e.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-(--radius-md) border border-green-200 bg-green-50 px-3 py-1.5 text-caption font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
            disabled={pending}
            onClick={onGoogleSheets}
          >
            <FileSpreadsheet className="size-3" />
            Google Sheets
          </button>
          <button
            type="button"
            className="text-caption font-medium text-(--color-brand)"
            onClick={() => setShowPaste((v) => !v)}
          >
            {showPaste ? "Cancel" : "Paste CSV"}
          </button>
        </div>
      </div>

      {error ? <p className="mt-2 text-caption text-(--color-danger)">{error}</p> : null}
      {message ? <p className="mt-2 text-caption text-(--color-success)">{message}</p> : null}

      {showPaste ? (
        <div className="mt-3 space-y-3">
          <label className="block text-caption text-(--color-text-tertiary)">
            Paste CSV (Patient Name, Date, Amount, Treatment)
          </label>
          <textarea
            rows={5}
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={"John Smith, 15/01/2025, 250.00, Crown\nJane Doe, 16/01/2025, 95.00, Filling"}
            className="w-full rounded-(--radius-md) border border-(--color-border-subtle) px-3 py-2 font-mono text-caption outline-none focus:ring-2 focus:ring-(--color-brand)/30"
          />
          <button
            type="button"
            disabled={pending || !csv.trim()}
            className="flex items-center gap-1.5 rounded-(--radius-md) bg-(--color-brand) px-3 py-1.5 text-caption font-semibold text-white disabled:opacity-50"
            onClick={() => void importCsv(csv)}
          >
            {pending ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
            Compare with Dentally data
          </button>
        </div>
      ) : null}

      {log.length > 0 ? (
        <div className="mt-3 border-t border-(--color-border-subtle) pt-3">
          <p className="mb-2 text-caption text-(--color-text-tertiary)">Imported log: {log.length} entries</p>
          <div className="max-h-32 space-y-1 overflow-y-auto text-caption">
            {log.slice(0, 5).map((entry, i) => (
              <div key={`${entry.patientName}-${i}`} className="flex justify-between text-(--color-text-secondary)">
                <span>{entry.patientName}</span>
                <span>{formatMoneyGBPOrDash(Math.round(entry.amount * 100))}</span>
              </div>
            ))}
            {log.length > 5 ? <p className="text-(--color-text-tertiary)">…and {log.length - 5} more</p> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
