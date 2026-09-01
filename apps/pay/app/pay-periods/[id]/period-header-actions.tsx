"use client";

import { Button } from "@elio/ui";
import { usePayPeriodActions } from "./pay-period-actions-provider";

/** Legacy payslip period header actions (Y2.1). */
export function PeriodHeaderActions() {
  const {
    locked,
    payslipCount,
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
        data-testid="email-all-pdfs"
      >
        Email All
      </Button>
      {!locked ? (
        <Button onClick={fetchFromDentally} loading={fetching} disabled={fetching || locking} data-testid="header-fetch-dentally">
          Fetch from Dentally
        </Button>
      ) : null}
      {locked ? (
        <Button variant="secondary" onClick={unlockPeriod} loading={unlocking} disabled={unlocking} data-testid="reopen-period">
          Reopen
        </Button>
      ) : (
        <Button
          variant="secondary"
          onClick={lockPeriod}
          loading={locking}
          disabled={locking || fetching || payslipCount === 0}
          data-testid="finalize-period"
        >
          Finalize
        </Button>
      )}
    </div>
  );
}
