-- AlterTable
ALTER TABLE "pay_payslip_entries" ADD COLUMN IF NOT EXISTS "labBillsJson" JSONB,
ADD COLUMN IF NOT EXISTS "adjustmentsJson" JSONB;
