-- B.1 — sync Dentally /payments for Flow deposit + totalPaid parity
CREATE TABLE "dentally_payments" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "dentallyId" TEXT NOT NULL,
    "patientId" TEXT,
    "amountPence" INTEGER,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dentally_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dentally_payments_practiceId_dentallyId_key" ON "dentally_payments"("practiceId", "dentallyId");
CREATE INDEX "dentally_payments_practiceId_idx" ON "dentally_payments"("practiceId");
CREATE INDEX "dentally_payments_patientId_idx" ON "dentally_payments"("patientId");

ALTER TABLE "dentally_payments" ADD CONSTRAINT "dentally_payments_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dentally_payments" ADD CONSTRAINT "dentally_payments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "dentally_patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
