-- F1.8 — bookedBy on Consult (legacy Sheets col P) + bookedByName on synced appointments.

ALTER TABLE "dentally_appointments" ADD COLUMN "bookedByName" TEXT;

ALTER TABLE "consults" ADD COLUMN "bookedBy" TEXT;
