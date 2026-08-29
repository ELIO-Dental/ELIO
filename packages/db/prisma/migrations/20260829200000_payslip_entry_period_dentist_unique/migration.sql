-- F.1 Final QA money-path audit: close a known, previously-flagged gap —
-- calculatePayslipForDentist() / the calculate route used find-then-write
-- with no DB-level guard against a concurrent duplicate PayslipEntry for the
-- same (payPeriodId, dentistId). Verified zero existing duplicate rows before
-- adding this constraint.
CREATE UNIQUE INDEX "pay_payslip_entries_payPeriodId_dentistId_key" ON "pay_payslip_entries"("payPeriodId", "dentistId");
