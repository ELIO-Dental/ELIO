-- P1.2: Map Dentally payment plan names to ELIO PlanModel for Plans import sync
CREATE TABLE "plans_dentally_plan_mappings" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "dentallyPlanName" TEXT NOT NULL,
    "planModelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_dentally_plan_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plans_dentally_plan_mappings_practiceId_dentallyPlanName_key" ON "plans_dentally_plan_mappings"("practiceId", "dentallyPlanName");
CREATE INDEX "plans_dentally_plan_mappings_practiceId_idx" ON "plans_dentally_plan_mappings"("practiceId");
CREATE INDEX "plans_dentally_plan_mappings_planModelId_idx" ON "plans_dentally_plan_mappings"("planModelId");

ALTER TABLE "plans_dentally_plan_mappings" ADD CONSTRAINT "plans_dentally_plan_mappings_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "plans_dentally_plan_mappings" ADD CONSTRAINT "plans_dentally_plan_mappings_planModelId_fkey" FOREIGN KEY ("planModelId") REFERENCES "plans_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
