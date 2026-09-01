"use client";

import { usePayPeriodActions } from "./pay-period-actions-provider";

function gbp(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

/** Dismissible Dentally fetch summary at top of period page (legacy Y2.2). */
export function FetchResultsBanner() {
  const { locked, fetchResult, fetchDismissed, dismissFetchResult } = usePayPeriodActions();

  if (locked || !fetchResult?.ok || fetchDismissed) return null;

  return (
    <section
      className="mb-8 rounded-(--radius-lg) border border-(--color-brand)/30 bg-(--color-brand)/5 px-5 py-4"
      data-testid="fetch-results-banner"
      role="status"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-body font-semibold text-(--color-brand)">Dentally Fetch Results</h2>
        <button
          type="button"
          className="shrink-0 text-caption text-(--color-text-tertiary) underline"
          onClick={dismissFetchResult}
        >
          Dismiss
        </button>
      </div>

      <p className="mt-2 text-body-sm text-(--color-text-primary)">{fetchResult.message}</p>

      {fetchResult.debug && (
        <div className="mt-3 space-y-1 text-caption text-(--color-text-secondary)">
          <p>
            In date range: <span className="font-semibold">{fetchResult.debug.invoicesInDateRange}</span>
            {" · "}
            Processed: {fetchResult.debug.processedInvoices}
            {fetchResult.debug.appointmentsFetched != null ? ` · ${fetchResult.debug.appointmentsFetched} appointments` : ""}
          </p>
          <p>
            Flagged for review: <span className="font-medium text-(--color-warning)">{fetchResult.debug.flaggedForReview ?? 0}</span>
            {fetchResult.debug.financePayments != null ? ` · Finance: ${fetchResult.debug.financePayments}` : ""}
          </p>
        </div>
      )}

      {fetchResult.summary && Object.keys(fetchResult.summary).length > 0 && (
        <div className="mt-4">
          <p className="text-caption font-medium text-(--color-text-secondary)">Summary by dentist</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {Object.entries(fetchResult.summary).map(([name, stats]) => (
              <div
                key={name}
                className="rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-surface) px-3 py-2 text-caption text-(--color-text-secondary)"
              >
                <p className="font-medium text-(--color-text-primary)">{name}</p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  <span>Invoiced: {gbp(stats.invoicedPence)}</span>
                  {stats.paidPence != null ? <span className="text-(--color-success)">Paid: {gbp(stats.paidPence)}</span> : null}
                  {stats.outstandingPence != null && stats.outstandingPence > 0 ? (
                    <span className="text-(--color-danger)">Outstanding: {gbp(stats.outstandingPence)}</span>
                  ) : null}
                  <span>{stats.invoiceCount} patients</span>
                  {(stats.financeCount ?? 0) > 0 ? <span>{stats.financeCount} finance</span> : null}
                  {stats.chairMins != null ? <span>{stats.chairMins} chair mins</span> : null}
                  {stats.grossPerHour != null ? <span>£{stats.grossPerHour}/hr gross</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {fetchResult.debug && fetchResult.debug.unmatchedClinicianIds.length > 0 && (
        <p className="mt-3 text-caption text-(--color-warning)">
          {fetchResult.debug.unmatchedClinicianIds.length} Dentally clinician ID(s) did not match a dentist — set
          dentallyPractitionerId on dentist records.
        </p>
      )}
    </section>
  );
}
