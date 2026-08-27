-- CreateEnum
CREATE TYPE "PlanRedeemStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PARTIALLY_EARNED');

-- CreateEnum
CREATE TYPE "PlanRedeemItemType" AS ENUM ('EXAMINATION', 'HYGIENE', 'DISCOUNT', 'OTHER');

-- AlterTable
ALTER TABLE "plans_plans" ADD COLUMN     "dentistPayoutPerExamPence" INTEGER,
ADD COLUMN     "eligibilityDentalFit" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gocardlessLink" TEXT,
ADD COLUMN     "isCurrentVersion" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "parentPlanId" TEXT,
ADD COLUMN     "publicDescription" TEXT,
ADD COLUMN     "requiresAdultMembership" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "plans_documents" ADD COLUMN     "expiryDate" TIMESTAMP(3),
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "plans_inclusions" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "itemType" "PlanRedeemItemType" NOT NULL DEFAULT 'OTHER',
    "quantity" INTEGER,
    "period" TEXT,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "plans_inclusions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans_discounts" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "percentage" DECIMAL(5,2) NOT NULL,
    "applicableTo" TEXT,
    "excludes" TEXT,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "plans_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans_eligibility_rules" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "ruleValue" TEXT,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "plans_eligibility_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans_redeem_rules" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "itemType" "PlanRedeemItemType" NOT NULL,
    "name" TEXT NOT NULL,
    "maxPerYear" INTEGER,
    "cooldownDays" INTEGER,
    "providerType" TEXT,
    "chairTimeMinutes" INTEGER,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_redeem_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans_redeems" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "planPatientId" TEXT NOT NULL,
    "patientPlanEnrolmentId" TEXT NOT NULL,
    "redeemRuleId" TEXT,
    "itemType" "PlanRedeemItemType" NOT NULL,
    "itemName" TEXT NOT NULL,
    "description" TEXT,
    "appointmentDate" TIMESTAMP(3),
    "appointmentRef" TEXT,
    "status" "PlanRedeemStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "isPartial" BOOLEAN NOT NULL DEFAULT false,
    "earnedPercentage" DECIMAL(5,2),
    "partialReason" TEXT,
    "dentallyMatched" BOOLEAN NOT NULL DEFAULT false,
    "dentallyAppointmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_redeems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans_signing_requests" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "planPatientId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "signedAt" TIMESTAMP(3),
    "signatureData" TEXT,
    "signatureIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_signing_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans_guide_articles" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_guide_articles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plans_inclusions_practiceId_idx" ON "plans_inclusions"("practiceId");

-- CreateIndex
CREATE INDEX "plans_discounts_practiceId_idx" ON "plans_discounts"("practiceId");

-- CreateIndex
CREATE INDEX "plans_eligibility_rules_practiceId_idx" ON "plans_eligibility_rules"("practiceId");

-- CreateIndex
CREATE INDEX "plans_redeem_rules_practiceId_idx" ON "plans_redeem_rules"("practiceId");

-- CreateIndex
CREATE INDEX "plans_redeems_practiceId_idx" ON "plans_redeems"("practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "plans_signing_requests_token_key" ON "plans_signing_requests"("token");

-- CreateIndex
CREATE INDEX "plans_signing_requests_practiceId_idx" ON "plans_signing_requests"("practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "plans_guide_articles_slug_key" ON "plans_guide_articles"("slug");

-- CreateIndex
CREATE INDEX "plans_guide_articles_practiceId_idx" ON "plans_guide_articles"("practiceId");

-- AddForeignKey
ALTER TABLE "plans_plans" ADD CONSTRAINT "plans_plans_parentPlanId_fkey" FOREIGN KEY ("parentPlanId") REFERENCES "plans_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_inclusions" ADD CONSTRAINT "plans_inclusions_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_inclusions" ADD CONSTRAINT "plans_inclusions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_discounts" ADD CONSTRAINT "plans_discounts_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_discounts" ADD CONSTRAINT "plans_discounts_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_eligibility_rules" ADD CONSTRAINT "plans_eligibility_rules_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_eligibility_rules" ADD CONSTRAINT "plans_eligibility_rules_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_mandates" ADD CONSTRAINT "plans_mandates_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_documents" ADD CONSTRAINT "plans_documents_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_redeem_rules" ADD CONSTRAINT "plans_redeem_rules_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_redeem_rules" ADD CONSTRAINT "plans_redeem_rules_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_redeems" ADD CONSTRAINT "plans_redeems_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_redeems" ADD CONSTRAINT "plans_redeems_planPatientId_fkey" FOREIGN KEY ("planPatientId") REFERENCES "plans_patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_redeems" ADD CONSTRAINT "plans_redeems_patientPlanEnrolmentId_fkey" FOREIGN KEY ("patientPlanEnrolmentId") REFERENCES "plans_patient_plan_enrolments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_redeems" ADD CONSTRAINT "plans_redeems_redeemRuleId_fkey" FOREIGN KEY ("redeemRuleId") REFERENCES "plans_redeem_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_redeems" ADD CONSTRAINT "plans_redeems_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_signing_requests" ADD CONSTRAINT "plans_signing_requests_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_signing_requests" ADD CONSTRAINT "plans_signing_requests_planPatientId_fkey" FOREIGN KEY ("planPatientId") REFERENCES "plans_patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_signing_requests" ADD CONSTRAINT "plans_signing_requests_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "plans_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_guide_articles" ADD CONSTRAINT "plans_guide_articles_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

