-- P4.4: per-practice Plans settings KV (legacy Setting table parity)
CREATE TABLE "plan_practice_settings" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_practice_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plan_practice_settings_practiceId_key_key" ON "plan_practice_settings"("practiceId", "key");
CREATE INDEX "plan_practice_settings_practiceId_idx" ON "plan_practice_settings"("practiceId");

ALTER TABLE "plan_practice_settings" ADD CONSTRAINT "plan_practice_settings_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
