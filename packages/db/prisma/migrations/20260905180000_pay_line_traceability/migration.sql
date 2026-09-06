-- Step 32 — private line traceability (invoice line key + manual author/note)
ALTER TABLE "pay_private_revenue_line_items" ADD COLUMN IF NOT EXISTS "dentallyLineKey" TEXT;
ALTER TABLE "pay_private_revenue_line_items" ADD COLUMN IF NOT EXISTS "sourceType" TEXT NOT NULL DEFAULT 'DENTALLY';
ALTER TABLE "pay_private_revenue_line_items" ADD COLUMN IF NOT EXISTS "manualCreatedByUserId" TEXT;
ALTER TABLE "pay_private_revenue_line_items" ADD COLUMN IF NOT EXISTS "manualNote" TEXT;
