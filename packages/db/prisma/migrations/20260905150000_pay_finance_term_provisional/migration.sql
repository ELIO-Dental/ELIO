-- Step 16 — finance term + provisional (additive)
ALTER TABLE "pay_private_revenue_line_items" ADD COLUMN IF NOT EXISTS "financeTermMonths" INTEGER;
ALTER TABLE "pay_private_revenue_line_items" ADD COLUMN IF NOT EXISTS "financeFeeManual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pay_payslip_entries" ADD COLUMN IF NOT EXISTS "provisional" BOOLEAN NOT NULL DEFAULT false;
