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

  async function fetchFromDentally() {
    setFetching(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/pay/api/pay-periods/${payPeriodId}/fetch-dentally`, { method: "POST" });
      const data = (await res.json()) as FetchResult & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to fetch from Dentally");
        return;
      }
      setResult(data);

      // Recalculate payslips using fetched PrivateRevenueLineItem rows (Y1.7).
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

      {result?.ok && (
        <div
          className="rounded-(--radius-md) border border-(--color-success-200) bg-(--color-success-50) px-4 py-3 text-body-sm text-(--color-success-800)"
          data-testid="fetch-dentally-result"
          role="status"
        >
          <p className="font-semibold">{result.message}</p>
          {result.summary && Object.keys(result.summary).length > 0 && (
            <ul className="mt-2 space-y-1">
              {Object.entries(result.summary).map(([name, stats]) => (
                <li key={name}>
                  {name}: £{(stats.invoicedPence / 100).toFixed(2)} ({stats.invoiceCount} invoice
                  {stats.invoiceCount === 1 ? "" : "s"})
                </li>
              ))}
            </ul>
          )}
          {result.debug && result.debug.unmatchedClinicianIds.length > 0 && (
            <p className="mt-2 text-(--color-warning-700)">
              {result.debug.unmatchedClinicianIds.length} Dentally clinician ID(s) did not match a dentist — check
              dentallyPractitionerId on dentist records.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="rounded-(--radius-md) border border-(--color-danger-200) bg-(--color-danger-50) px-4 py-3 text-body-sm text-(--color-danger-700)">
          {error}
        </p>
      )}
    </div>
  );
}
