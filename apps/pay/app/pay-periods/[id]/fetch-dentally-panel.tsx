"use client";

import { usePayPeriodActions } from "./pay-period-actions-provider";

function gbp(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

/** Fetch results banner (Y2.2 partial) — button lives in period header (Y2.1). */
export function FetchDentallyPanel() {
  const { locked, fetchResult, fetchError, fetchDismissed, dismissFetchResult } = usePayPeriodActions();

  if (locked) return null;

  return (
    <div className="space-y-3" data-testid="fetch-dentally-panel">
      {fetchResult?.ok && !fetchDismissed && (
        <div
          className="rounded-(--radius-md) border border-(--color-success) bg-(--color-success-bg) px-4 py-3 text-body-sm text-(--color-text-primary)"
          data-testid="fetch-dentally-result"
          role="status"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="font-semibold text-(--color-success)">{fetchResult.message}</p>
            <button
              type="button"
              className="shrink-0 text-caption text-(--color-text-tertiary) underline"
              onClick={dismissFetchResult}
            >
              Dismiss
            </button>
          </div>

          {fetchResult.debug && (
            <p className="mt-2 text-(--color-text-secondary)">
              {fetchResult.debug.processedInvoices} invoices processed
              {fetchResult.debug.appointmentsFetched != null ? ` · ${fetchResult.debug.appointmentsFetched} appointments` : ""}
              {fetchResult.debug.financePayments != null ? ` · ${fetchResult.debug.financePayments} finance` : ""}
              {fetchResult.debug.flaggedForReview != null ? ` · ${fetchResult.debug.flaggedForReview} flagged` : ""}
            </p>
          )}

          {fetchResult.summary && Object.keys(fetchResult.summary).length > 0 && (
            <ul className="mt-2 space-y-2 text-(--color-text-secondary)">
              {Object.entries(fetchResult.summary).map(([name, stats]) => (
                <li key={name}>
                  <span className="font-medium text-(--color-text-primary)">{name}</span>: {gbp(stats.invoicedPence)}{" "}
                  invoiced ({stats.invoiceCount} patients)
                  {stats.paidPence != null ? ` · ${gbp(stats.paidPence)} paid` : ""}
                  {stats.outstandingPence != null && stats.outstandingPence > 0
                    ? ` · ${gbp(stats.outstandingPence)} outstanding`
                    : ""}
                  {stats.chairMins != null ? ` · ${stats.chairMins} chair mins` : ""}
                  {stats.grossPerHour != null ? ` · £${stats.grossPerHour}/hr gross` : ""}
                </li>
              ))}
            </ul>
          )}

          {fetchResult.debug && fetchResult.debug.unmatchedClinicianIds.length > 0 && (
            <p className="mt-2 text-(--color-warning)">
              {fetchResult.debug.unmatchedClinicianIds.length} Dentally clinician ID(s) did not match a dentist — set
              dentallyPractitionerId on dentist records.
            </p>
          )}
        </div>
      )}

      {fetchError && (
        <p className="rounded-(--radius-md) border border-(--color-danger) bg-(--color-danger-bg) px-4 py-3 text-body-sm text-(--color-danger)">
          {fetchError}
        </p>
      )}
    </div>
  );
}
