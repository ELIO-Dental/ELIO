-- F1.10 — preserve manually edited practitioner on Dentally re-import.

ALTER TABLE "consults" ADD COLUMN "practitionerEdited" BOOLEAN NOT NULL DEFAULT false;
