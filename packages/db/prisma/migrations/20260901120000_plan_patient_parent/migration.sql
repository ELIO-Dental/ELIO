-- P2.8: Family / child plan enrolment — link free child PlanPatient to paying parent member.
ALTER TABLE "plans_patients" ADD COLUMN "parentPatientId" TEXT;

CREATE INDEX "plans_patients_parentPatientId_idx" ON "plans_patients"("parentPatientId");

ALTER TABLE "plans_patients" ADD CONSTRAINT "plans_patients_parentPatientId_fkey"
  FOREIGN KEY ("parentPatientId") REFERENCES "plans_patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
