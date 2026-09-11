"use client";

import * as React from "react";
import Link from "next/link";
import { Button, ConfirmDialog } from "@elio/ui";
import { usePayPeriodActions } from "./pay-period-actions-provider";

/** Legacy payslip period header actions (Y2.1). */
export function PeriodHeaderActions({ periodId }: { periodId: string }) {
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
  // Finalize/Reopen used to fire immediately on click — the only mutation in this
  // app without a confirm step, despite Finalize being the single most consequential
  // action here (freezes payroll figures). Every delete elsewhere in the app already
  // confirms first.
  const [confirmAction, setConfirmAction] = React.useState<"finalize" | "reopen" | null>(null);

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
      <Button variant="secondary" asChild data-testid="header-occupancy-report">
        <Link href={`/pay-periods/${periodId}/occupancy`}>Diary occupancy</Link>
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
        <Button
          variant="outline"
          onClick={() => setConfirmAction("reopen")}
          loading={unlocking}
          disabled={unlocking}
          data-testid="reopen-period"
        >
          Reopen
        </Button>
      ) : (
        <Button
          variant="outline"
          className="border-(--color-success) text-(--color-success) hover:bg-(--color-success)/10 hover:border-(--color-success) hover:text-(--color-success)"
          onClick={() => setConfirmAction("finalize")}
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

      <ConfirmDialog
        open={confirmAction !== null}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={confirmAction === "finalize" ? "Finalize this pay period?" : "Reopen this pay period?"}
        description={
          confirmAction === "finalize"
            ? "This freezes every payslip figure for this period. You can reopen it later if you need to make changes."
            : "This unlocks every payslip in this period for editing again."
        }
        confirmLabel={confirmAction === "finalize" ? "Finalize" : "Reopen"}
        variant={confirmAction === "finalize" ? "destructive" : "default"}
        onConfirm={() => (confirmAction === "finalize" ? lockPeriod() : unlockPeriod())}
      />
    </div>
  );
}
