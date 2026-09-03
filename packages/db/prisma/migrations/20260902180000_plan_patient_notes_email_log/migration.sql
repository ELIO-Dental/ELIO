-- Plan patient notes + email correspondence (legacy ElioPlans PatientNote / EmailLog).

CREATE TABLE "plans_patient_notes" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "planPatientId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_patient_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "plans_email_logs" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "planPatientId" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "messageId" TEXT,
    "sentById" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_email_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "plans_patient_notes_practiceId_idx" ON "plans_patient_notes"("practiceId");
CREATE INDEX "plans_patient_notes_planPatientId_createdAt_idx" ON "plans_patient_notes"("planPatientId", "createdAt");

CREATE INDEX "plans_email_logs_practiceId_idx" ON "plans_email_logs"("practiceId");
CREATE INDEX "plans_email_logs_planPatientId_createdAt_idx" ON "plans_email_logs"("planPatientId", "createdAt");

ALTER TABLE "plans_patient_notes" ADD CONSTRAINT "plans_patient_notes_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plans_patient_notes" ADD CONSTRAINT "plans_patient_notes_planPatientId_fkey" FOREIGN KEY ("planPatientId") REFERENCES "plans_patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plans_patient_notes" ADD CONSTRAINT "plans_patient_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "plans_email_logs" ADD CONSTRAINT "plans_email_logs_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plans_email_logs" ADD CONSTRAINT "plans_email_logs_planPatientId_fkey" FOREIGN KEY ("planPatientId") REFERENCES "plans_patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plans_email_logs" ADD CONSTRAINT "plans_email_logs_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
