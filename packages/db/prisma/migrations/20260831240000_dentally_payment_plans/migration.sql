-- B.3: Dentally payment plans for Plans mapping sync
CREATE TABLE "dentally_payment_plans" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "dentallyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "patientFriendlyName" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "siteId" TEXT,
    "colour" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dentally_payment_plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dentally_payment_plans_practiceId_dentallyId_key" ON "dentally_payment_plans"("practiceId", "dentallyId");
CREATE INDEX "dentally_payment_plans_practiceId_idx" ON "dentally_payment_plans"("practiceId");
CREATE INDEX "dentally_payment_plans_practiceId_name_idx" ON "dentally_payment_plans"("practiceId", "name");

ALTER TABLE "dentally_payment_plans" ADD CONSTRAINT "dentally_payment_plans_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
