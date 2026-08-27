-- AlterTable
ALTER TABLE "dentally_treatments" ADD COLUMN     "dentallyPractitionerId" TEXT,
ADD COLUMN     "dentallyTreatmentCategory" TEXT,
ADD COLUMN     "dentistId" TEXT;

-- AlterTable
ALTER TABLE "pay_dentists" ADD COLUMN     "dentallyPractitionerId" TEXT;

-- AlterTable
ALTER TABLE "practices" ADD COLUMN     "cosmeticConsultationTreatmentCode" TEXT;

-- CreateIndex
CREATE INDEX "dentally_treatments_dentistId_idx" ON "dentally_treatments"("dentistId");

-- CreateIndex
CREATE INDEX "pay_dentists_practiceId_dentallyPractitionerId_idx" ON "pay_dentists"("practiceId", "dentallyPractitionerId");

-- AddForeignKey
ALTER TABLE "dentally_treatments" ADD CONSTRAINT "dentally_treatments_dentistId_fkey" FOREIGN KEY ("dentistId") REFERENCES "pay_dentists"("id") ON DELETE SET NULL ON UPDATE CASCADE;
