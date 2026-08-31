-- Y1.5–Y1.6: Dentally fetch snapshot fields (AuraPay payslip JSON parity)
ALTER TABLE "pay_payslip_entries" ADD COLUMN IF NOT EXISTS "dentallyPatientsJson" JSONB;
ALTER TABLE "pay_payslip_entries" ADD COLUMN IF NOT EXISTS "dentallyAnalyticsJson" JSONB;
ALTER TABLE "pay_payslip_entries" ADD COLUMN IF NOT EXISTS "dentallyTherapyJson" JSONB;
ALTER TABLE "pay_payslip_entries" ADD COLUMN IF NOT EXISTS "dentallyDiscrepanciesJson" JSONB;
ALTER TABLE "pay_payslip_entries" ADD COLUMN IF NOT EXISTS "therapyMinutes" DECIMAL(8,2);
ALTER TABLE "pay_payslip_entries" ADD COLUMN IF NOT EXISTS "therapyRatePence" INTEGER;

ALTER TABLE "pay_private_revenue_line_items" ADD COLUMN IF NOT EXISTS "patientName" TEXT;
ALTER TABLE "pay_private_revenue_line_items" ADD COLUMN IF NOT EXISTS "invoiceDate" TEXT;
ALTER TABLE "pay_private_revenue_line_items" ADD COLUMN IF NOT EXISTS "dentallyInvoiceId" TEXT;
ALTER TABLE "pay_private_revenue_line_items" ADD COLUMN IF NOT EXISTS "dentallyPatientId" TEXT;
ALTER TABLE "pay_private_revenue_line_items" ADD COLUMN IF NOT EXISTS "durationMins" INTEGER;
ALTER TABLE "pay_private_revenue_line_items" ADD COLUMN IF NOT EXISTS "isFinance" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pay_private_revenue_line_items" ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT;
ALTER TABLE "pay_private_revenue_line_items" ADD COLUMN IF NOT EXISTS "amountPaidPence" INTEGER;
ALTER TABLE "pay_private_revenue_line_items" ADD COLUMN IF NOT EXISTS "amountOutstandingPence" INTEGER;
ALTER TABLE "pay_private_revenue_line_items" ADD COLUMN IF NOT EXISTS "treatmentDescription" TEXT;
ALTER TABLE "pay_private_revenue_line_items" ADD COLUMN IF NOT EXISTS "hourlyRatePence" INTEGER;
