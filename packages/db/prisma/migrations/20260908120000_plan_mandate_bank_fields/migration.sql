-- AlterTable
ALTER TABLE "plans_mandates" ADD COLUMN IF NOT EXISTS "bankName" TEXT;
ALTER TABLE "plans_mandates" ADD COLUMN IF NOT EXISTS "accountNumberEnding" TEXT;
ALTER TABLE "plans_mandates" ADD COLUMN IF NOT EXISTS "accountHolderName" TEXT;
