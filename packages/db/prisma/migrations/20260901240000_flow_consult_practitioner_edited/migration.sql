-- F1.10 — preserve manually edited practitioner on Dentally re-import.

ALTER TABLE "flow_consults" ADD COLUMN IF NOT EXISTS "practitionerEdited" BOOLEAN NOT NULL DEFAULT false;
