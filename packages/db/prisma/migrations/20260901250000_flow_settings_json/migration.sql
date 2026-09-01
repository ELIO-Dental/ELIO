-- F3.1 — per-practice Flow settings (plan name, consult filter, conversion thresholds).

ALTER TABLE "practices" ADD COLUMN "flowSettingsJson" JSONB;
