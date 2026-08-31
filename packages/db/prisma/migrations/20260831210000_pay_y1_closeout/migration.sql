-- Y1 close-out: finance fee on patient lines; drop orphan therapyRatePence from earlier migration
ALTER TABLE "pay_private_revenue_line_items" ADD COLUMN IF NOT EXISTS "financeFeePence" INTEGER;
ALTER TABLE "pay_payslip_entries" DROP COLUMN IF EXISTS "therapyRatePence";
