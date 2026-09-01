-- B.2 — sync Dentally /accounts for Flow plan value parity
CREATE TABLE "dentally_accounts" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "dentallyId" TEXT NOT NULL,
    "patientId" TEXT,
    "currentBalancePence" INTEGER,
    "plannedPrivateTreatmentValuePence" INTEGER,
    "plannedNhsTreatmentValuePence" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dentally_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dentally_accounts_practiceId_dentallyId_key" ON "dentally_accounts"("practiceId", "dentallyId");
CREATE INDEX "dentally_accounts_practiceId_idx" ON "dentally_accounts"("practiceId");
CREATE INDEX "dentally_accounts_patientId_idx" ON "dentally_accounts"("patientId");

ALTER TABLE "dentally_accounts" ADD CONSTRAINT "dentally_accounts_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dentally_accounts" ADD CONSTRAINT "dentally_accounts_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "dentally_patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
