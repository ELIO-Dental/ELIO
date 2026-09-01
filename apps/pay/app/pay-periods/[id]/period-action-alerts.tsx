"use client";

import { usePayPeriodActions } from "./pay-period-actions-provider";

/** Header action errors (lock, download, fetch) — visible even when period is locked (Y2.1). */
export function PeriodActionAlerts() {
  const { actionError } = usePayPeriodActions();
  if (!actionError) return null;

  return (
    <p
      className="mb-6 rounded-(--radius-md) border border-(--color-danger) bg-(--color-danger-bg) px-4 py-3 text-body-sm text-(--color-danger)"
      data-testid="period-action-error"
      role="alert"
    >
      {actionError}
    </p>
  );
}
