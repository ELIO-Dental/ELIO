-- CreateEnum
CREATE TYPE "ConsultStuckReason" AS ENUM ('FAILED_FINANCE', 'PRICE_SHOPPING', 'BAD_EXPERIENCE', 'OUT_OF_BUDGET');

-- AlterTable
ALTER TABLE "flow_enquiries" ADD COLUMN     "capturedByUserId" TEXT;

-- AlterTable
ALTER TABLE "flow_consults" ADD COLUMN     "appointmentId" TEXT,
ADD COLUMN     "attended" BOOLEAN,
ADD COLUMN     "hasDeposit" BOOLEAN,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "planSignedUp" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "practitionerDentistId" TEXT,
ADD COLUMN     "quotePenceOverride" INTEGER,
ADD COLUMN     "stuckReason" "ConsultStuckReason",
ADD COLUMN     "totalPaidPence" INTEGER,
ADD COLUMN     "treatmentBooked" BOOLEAN;

-- AlterTable
ALTER TABLE "flow_reminders" ADD COLUMN     "channel" TEXT;

-- AddForeignKey
ALTER TABLE "flow_enquiries" ADD CONSTRAINT "flow_enquiries_capturedByUserId_fkey" FOREIGN KEY ("capturedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_consults" ADD CONSTRAINT "flow_consults_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "dentally_appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_consults" ADD CONSTRAINT "flow_consults_practitionerDentistId_fkey" FOREIGN KEY ("practitionerDentistId") REFERENCES "pay_dentists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

