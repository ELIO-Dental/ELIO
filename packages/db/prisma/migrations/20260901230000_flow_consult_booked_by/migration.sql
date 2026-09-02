-- F1.8 — bookedBy on Consult (legacy Sheets col P) + bookedByName on synced appointments.

ALTER TABLE "dentally_appointments" ADD COLUMN IF NOT EXISTS "bookedByName" TEXT;

ALTER TABLE "flow_consults" ADD COLUMN IF NOT EXISTS "bookedBy" TEXT;
