"use client";

import { Button } from "@elio/ui";
import { usePayPeriodActions } from "./pay-period-actions-provider";

/** Legacy payslip period header actions (Y2.1). */
export function PeriodHeaderActions() {
  const {
    locked,
    payslipCount,
    anyProvisional,
    fetching,
    locking,
    unlocking,
    downloading,
    emailing,
    fetchFromDentally,
    lockPeriod,
    unlockPeriod,
    downloadAllPdfs,
    emailAllPayslips,
  } = usePayPeriodActions();

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="period-header-actions">
      <Button
        variant="secondary"
        onClick={downloadAllPdfs}
        loading={downloading}
        disabled={payslipCount === 0 || downloading}
        data-testid="download-all-pdfs"
      >
        Download All PDFs
      </Button>
      <Button
        variant="secondary"
        onClick={emailAllPayslips}
        loading={emailing}
        disabled={payslipCount === 0 || emailing}
        title={anyProvisional ? "Emails will be labelled PROVISIONAL until finance term/fee confirmed" : undefined}
        data-testid="email-all-pdfs"
      >
        Email All{anyProvisional ? " (provisional)" : ""}
      </Button>
      {!locked ? (
        <Button
          variant="primary"
          onClick={fetchFromDentally}
          loading={fetching}
          disabled={fetching || locking}
          data-testid="header-fetch-dentally"
        >
          Fetch from Dentally
        </Button>
      ) : null}
      {locked ? (
        <Button variant="outline" onClick={unlockPeriod} loading={unlocking} disabled={unlocking} data-testid="reopen-period">
          Reopen
        </Button>
      ) : (
        <Button
          variant="outline"
          className="border-(--color-success) text-(--color-success) hover:bg-(--color-success)/10 hover:border-(--color-success) hover:text-(--color-success)"
          onClick={lockPeriod}
          loading={locking}
          disabled={locking || fetching || payslipCount === 0 || anyProvisional}
          title={
            anyProvisional
              ? "Cannot finalize while provisional payslips remain — confirm finance term/fee first"
              : undefined
          }
          data-testid="finalize-period"
        >
          Finalize
        </Button>
      )}
    </div>
  );
}
