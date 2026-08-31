"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@elio/ui";

interface FetchSummaryEntry {
  invoicedPence: number;
  invoiceCount: number;
}

interface FetchResult {
  ok: boolean;
  message: string;
  summary?: Record<string, FetchSummaryEntry>;
  debug?: {
    invoicesInDateRange: number;
    processedInvoices: number;
    unmatchedClinicianIds: string[];
  };
}

export function FetchDentallyPanel({
  payPeriodId,
  dentistIds,
  locked,
}: {
  payPeriodId: string;
  dentistIds: string[];
  locked: boolean;
}) {
  const router = useRouter();
  const [fetching, setFetching] = React.useState(false);
  const [result, setResult] = React.useState<FetchResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [dismissed, setDismissed] = React.useState(false);

  async function fetchFromDentally() {
    setFetching(true);
    setError(null);
    setResult(null);
    setDismissed(false);
    try {
      const res = await fetch(`/pay/api/pay-periods/${payPeriodId}/fetch-dentally`, { method: "POST" });
      const data = (await res.json()) as FetchResult & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to fetch from Dentally");
        return;
      }
      setResult(data);

      if (dentistIds.length > 0) {
        await fetch(`/pay/api/pay-periods/${payPeriodId}/calculate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dentists: dentistIds.map((dentistId) => ({ dentistId })),
          }),
        });
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setFetching(false);
    }
  }

  if (locked) return null;

  return (
    <div className="space-y-3" data-testid="fetch-dentally-panel">
      <Button onClick={fetchFromDentally} loading={fetching} data-testid="fetch-dentally-button">
        Fetch from Dentally
      </Button>

      {result?.ok && !dismissed && (
        <div
          className="rounded-(--radius-md) border border-(--color-success) bg-(--color-success-bg) px-4 py-3 text-body-sm text-(--color-text-primary)"
          data-testid="fetch-dentally-result"
          role="status"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="font-semibold text-(--color-success)">{result.message}</p>
            <button
              type="button"
              className="shrink-0 text-caption text-(--color-text-tertiary) underline"
              onClick={() => setDismissed(true)}
            >
              Dismiss
            </button>
          </div>
          {result.summary && Object.keys(result.summary).length > 0 && (
            <ul className="mt-2 space-y-1 text-(--color-text-secondary)">
              {Object.entries(result.summary).map(([name, stats]) => (
                <li key={name}>
                  {name}: £{(stats.invoicedPence / 100).toFixed(2)} ({stats.invoiceCount} invoice
                  {stats.invoiceCount === 1 ? "" : "s"})
                </li>
              ))}
            </ul>
          )}
          {result.debug && result.debug.unmatchedClinicianIds.length > 0 && (
            <p className="mt-2 text-(--color-warning)">
              {result.debug.unmatchedClinicianIds.length} Dentally clinician ID(s) did not match a dentist — check
              dentallyPractitionerId on dentist records.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-(--radius-md) border border-(--color-danger) bg-(--color-danger-bg) px-4 py-3 text-body-sm text-(--color-danger)">
          {error}
        </p>
      )}
    </div>
  );
}
