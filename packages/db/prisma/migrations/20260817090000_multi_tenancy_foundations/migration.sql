-- CreateEnum
CREATE TYPE "DentallyConnectionStatus" AS ENUM ('NOT_CONNECTED', 'CONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE');

-- CreateEnum
CREATE TYPE "ModuleId" AS ENUM ('PAY', 'PLANS', 'FLOW');

-- CreateEnum
CREATE TYPE "PlanPatientStatus" AS ENUM ('INVITED', 'SIGNED', 'ACTIVE', 'PAUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PlanEnrolmentStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PlanMandateStatus" AS ENUM ('PENDING', 'ACTIVE', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PlanPaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PAID_OUT', 'FAILED', 'CANCELLED', 'CHARGED_BACK');

-- CreateEnum
CREATE TYPE "PlanDocumentType" AS ENUM ('TERMS_AND_CONDITIONS', 'PRIVACY_POLICY', 'PLAN_AGREEMENT');

-- CreateEnum
CREATE TYPE "PayType" AS ENUM ('PERCENTAGE_SPLIT', 'HOURLY');

-- CreateEnum
CREATE TYPE "PayPeriodStatus" AS ENUM ('DRAFT', 'LOCKED');

-- CreateEnum
CREATE TYPE "CompassStatementStatus" AS ENUM ('PENDING', 'PARSED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "MatchConfidence" AS ENUM ('CONFIDENT', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "HourEntrySource" AS ENUM ('DENTALLY', 'MANUAL_OVERRIDE');

-- CreateEnum
CREATE TYPE "ConsultOutcome" AS ENUM ('ACCEPTED', 'THINKING', 'DECLINED');

-- AlterTable
ALTER TABLE "practices" ADD COLUMN     "customDomain" TEXT,
ADD COLUMN     "dentallyApiKey" TEXT,
ADD COLUMN     "dentallyConnectionStatus" "DentallyConnectionStatus" NOT NULL DEFAULT 'NOT_CONNECTED',
ADD COLUMN     "onboardingStatus" "OnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "plan" TEXT,
ADD COLUMN     "supportStatus" TEXT,
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "impersonatedUserId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licences" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "moduleId" "ModuleId" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "grantedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),

    CONSTRAINT "licences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_feature_flags" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "featureFlagId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "practice_feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impersonation_sessions" (
    "id" TEXT NOT NULL,
    "superAdminUserId" TEXT NOT NULL,
    "impersonatedUserId" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "reason" TEXT,

    CONSTRAINT "impersonation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dentally_patients" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "dentallyId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dentally_patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dentally_appointments" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "dentallyId" TEXT NOT NULL,
    "patientId" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dentally_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dentally_treatments" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "dentallyId" TEXT NOT NULL,
    "patientId" TEXT,
    "completedAt" TIMESTAMP(3),
    "amountPence" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dentally_treatments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dentally_invoices" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "dentallyId" TEXT NOT NULL,
    "patientId" TEXT,
    "totalPence" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dentally_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_dentists" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "nhsPerformerNumber" TEXT,
    "payType" "PayType" NOT NULL,
    "privateSplitPercent" DECIMAL(5,2),
    "udaRatePence" INTEGER,
    "hourlyRatePence" INTEGER,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pay_dentists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_hour_entries" (
    "id" TEXT NOT NULL,
    "dentistId" TEXT NOT NULL,
    "payPeriodId" TEXT NOT NULL,
    "hours" DECIMAL(6,2) NOT NULL,
    "source" "HourEntrySource" NOT NULL DEFAULT 'DENTALLY',
    "enteredBy" TEXT,
    "overriddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pay_hour_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_periods" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "PayPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "lockedAt" TIMESTAMP(3),
    "triggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pay_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_compass_statements" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "payPeriodId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "contractNumber" TEXT,
    "statementReference" TEXT,
    "statementDate" TIMESTAMP(3),
    "activityPeriodStart" TIMESTAMP(3),
    "activityPeriodEnd" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parsedAt" TIMESTAMP(3),
    "status" "CompassStatementStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "pay_compass_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_compass_statement_lines" (
    "id" TEXT NOT NULL,
    "compassStatementId" TEXT NOT NULL,
    "dentistId" TEXT,
    "performerNumber" TEXT,
    "rawDentistName" TEXT,
    "udas" DECIMAL(8,2),
    "superannuationPence" INTEGER,
    "matchConfidence" "MatchConfidence" NOT NULL DEFAULT 'NEEDS_REVIEW',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pay_compass_statement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_payslip_entries" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "payPeriodId" TEXT NOT NULL,
    "dentistId" TEXT NOT NULL,
    "payType" "PayType" NOT NULL,
    "udas" DECIMAL(8,2),
    "udaRatePence" INTEGER,
    "nhsEarningsPence" INTEGER,
    "grossPrivateRevenuePence" INTEGER,
    "privateSplitPercent" DECIMAL(5,2),
    "privateEarningsPence" INTEGER,
    "consultationExclusionsPence" INTEGER,
    "labDeductionPence" INTEGER,
    "superannuationPence" INTEGER,
    "hoursWorked" DECIMAL(6,2),
    "hourlyRatePence" INTEGER,
    "hourlyEarningsPence" INTEGER,
    "manualAdjustmentsPence" INTEGER NOT NULL DEFAULT 0,
    "adjustmentReason" TEXT,
    "finalPayPence" INTEGER,
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pay_payslip_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_private_revenue_line_items" (
    "id" TEXT NOT NULL,
    "payslipEntryId" TEXT NOT NULL,
    "treatmentId" TEXT,
    "amountPence" INTEGER NOT NULL,
    "excludedAsConsultation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pay_private_revenue_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_lab_bill_entries" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "dentistId" TEXT,
    "amountPence" INTEGER NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pay_lab_bill_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans_plans" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyPricePence" INTEGER NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans_patients" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "status" "PlanPatientStatus" NOT NULL DEFAULT 'INVITED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "planModelId" TEXT,

    CONSTRAINT "plans_patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans_patient_plan_enrolments" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "planPatientId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "PlanEnrolmentStatus" NOT NULL DEFAULT 'PENDING',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_patient_plan_enrolments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans_mandates" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "planPatientId" TEXT NOT NULL,
    "gocardlessMandateId" TEXT NOT NULL,
    "status" "PlanMandateStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_mandates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans_payments" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "planPatientId" TEXT NOT NULL,
    "patientPlanEnrolmentId" TEXT,
    "mandateId" TEXT,
    "billingPeriod" TEXT,
    "gocardlessPaymentId" TEXT,
    "amountPence" INTEGER NOT NULL,
    "status" "PlanPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans_documents" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "type" "PlanDocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans_document_acceptances" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "planPatientId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,

    CONSTRAINT "plans_document_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow_enquiries" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "patientId" TEXT,
    "source" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flow_enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow_consults" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "quotePence" INTEGER,
    "outcome" "ConsultOutcome",
    "outcomeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flow_consults_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow_reminders" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "consultId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flow_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_practiceId_idx" ON "audit_logs"("practiceId");

-- CreateIndex
CREATE INDEX "licences_practiceId_idx" ON "licences"("practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "licences_practiceId_moduleId_key" ON "licences"("practiceId", "moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "feature_flags_key_key" ON "feature_flags"("key");

-- CreateIndex
CREATE INDEX "practice_feature_flags_practiceId_idx" ON "practice_feature_flags"("practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "practice_feature_flags_practiceId_featureFlagId_key" ON "practice_feature_flags"("practiceId", "featureFlagId");

-- CreateIndex
CREATE INDEX "impersonation_sessions_practiceId_idx" ON "impersonation_sessions"("practiceId");

-- CreateIndex
CREATE INDEX "dentally_patients_practiceId_idx" ON "dentally_patients"("practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "dentally_patients_practiceId_dentallyId_key" ON "dentally_patients"("practiceId", "dentallyId");

-- CreateIndex
CREATE INDEX "dentally_appointments_practiceId_idx" ON "dentally_appointments"("practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "dentally_appointments_practiceId_dentallyId_key" ON "dentally_appointments"("practiceId", "dentallyId");

-- CreateIndex
CREATE INDEX "dentally_treatments_practiceId_idx" ON "dentally_treatments"("practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "dentally_treatments_practiceId_dentallyId_key" ON "dentally_treatments"("practiceId", "dentallyId");

-- CreateIndex
CREATE INDEX "dentally_invoices_practiceId_idx" ON "dentally_invoices"("practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "dentally_invoices_practiceId_dentallyId_key" ON "dentally_invoices"("practiceId", "dentallyId");

-- CreateIndex
CREATE INDEX "pay_dentists_practiceId_idx" ON "pay_dentists"("practiceId");

-- CreateIndex
CREATE INDEX "pay_hour_entries_dentistId_idx" ON "pay_hour_entries"("dentistId");

-- CreateIndex
CREATE INDEX "pay_hour_entries_payPeriodId_idx" ON "pay_hour_entries"("payPeriodId");

-- CreateIndex
CREATE INDEX "pay_periods_practiceId_idx" ON "pay_periods"("practiceId");

-- CreateIndex
CREATE INDEX "pay_periods_periodStart_idx" ON "pay_periods"("periodStart");

-- CreateIndex
CREATE INDEX "pay_periods_periodEnd_idx" ON "pay_periods"("periodEnd");

-- CreateIndex
CREATE INDEX "pay_compass_statements_practiceId_idx" ON "pay_compass_statements"("practiceId");

-- CreateIndex
CREATE INDEX "pay_compass_statements_payPeriodId_idx" ON "pay_compass_statements"("payPeriodId");

-- CreateIndex
CREATE INDEX "pay_compass_statement_lines_compassStatementId_idx" ON "pay_compass_statement_lines"("compassStatementId");

-- CreateIndex
CREATE INDEX "pay_compass_statement_lines_dentistId_idx" ON "pay_compass_statement_lines"("dentistId");

-- CreateIndex
CREATE INDEX "pay_payslip_entries_practiceId_idx" ON "pay_payslip_entries"("practiceId");

-- CreateIndex
CREATE INDEX "pay_payslip_entries_payPeriodId_idx" ON "pay_payslip_entries"("payPeriodId");

-- CreateIndex
CREATE INDEX "pay_payslip_entries_dentistId_idx" ON "pay_payslip_entries"("dentistId");

-- CreateIndex
CREATE INDEX "pay_private_revenue_line_items_payslipEntryId_idx" ON "pay_private_revenue_line_items"("payslipEntryId");

-- CreateIndex
CREATE INDEX "pay_lab_bill_entries_practiceId_idx" ON "pay_lab_bill_entries"("practiceId");

-- CreateIndex
CREATE INDEX "pay_lab_bill_entries_dentistId_idx" ON "pay_lab_bill_entries"("dentistId");

-- CreateIndex
CREATE INDEX "plans_plans_practiceId_idx" ON "plans_plans"("practiceId");

-- CreateIndex
CREATE INDEX "plans_patients_practiceId_idx" ON "plans_patients"("practiceId");

-- CreateIndex
CREATE INDEX "plans_patients_patientId_idx" ON "plans_patients"("patientId");

-- CreateIndex
CREATE INDEX "plans_patient_plan_enrolments_practiceId_idx" ON "plans_patient_plan_enrolments"("practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "plans_mandates_gocardlessMandateId_key" ON "plans_mandates"("gocardlessMandateId");

-- CreateIndex
CREATE INDEX "plans_mandates_practiceId_idx" ON "plans_mandates"("practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "plans_payments_gocardlessPaymentId_key" ON "plans_payments"("gocardlessPaymentId");

-- CreateIndex
CREATE INDEX "plans_payments_practiceId_idx" ON "plans_payments"("practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "plans_payments_patientPlanEnrolmentId_billingPeriod_key" ON "plans_payments"("patientPlanEnrolmentId", "billingPeriod");

-- CreateIndex
CREATE INDEX "plans_documents_practiceId_idx" ON "plans_documents"("practiceId");

-- CreateIndex
CREATE INDEX "plans_document_acceptances_practiceId_idx" ON "plans_document_acceptances"("practiceId");

-- CreateIndex
CREATE INDEX "flow_enquiries_practiceId_idx" ON "flow_enquiries"("practiceId");

-- CreateIndex
CREATE INDEX "flow_consults_practiceId_idx" ON "flow_consults"("practiceId");

-- CreateIndex
CREATE INDEX "flow_reminders_practiceId_idx" ON "flow_reminders"("practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "practices_customDomain_key" ON "practices"("customDomain");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licences" ADD CONSTRAINT "licences_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_feature_flags" ADD CONSTRAINT "practice_feature_flags_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_feature_flags" ADD CONSTRAINT "practice_feature_flags_featureFlagId_fkey" FOREIGN KEY ("featureFlagId") REFERENCES "feature_flags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dentally_patients" ADD CONSTRAINT "dentally_patients_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dentally_appointments" ADD CONSTRAINT "dentally_appointments_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dentally_appointments" ADD CONSTRAINT "dentally_appointments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "dentally_patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dentally_treatments" ADD CONSTRAINT "dentally_treatments_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dentally_treatments" ADD CONSTRAINT "dentally_treatments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "dentally_patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dentally_invoices" ADD CONSTRAINT "dentally_invoices_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dentally_invoices" ADD CONSTRAINT "dentally_invoices_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "dentally_patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_dentists" ADD CONSTRAINT "pay_dentists_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_hour_entries" ADD CONSTRAINT "pay_hour_entries_dentistId_fkey" FOREIGN KEY ("dentistId") REFERENCES "pay_dentists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_hour_entries" ADD CONSTRAINT "pay_hour_entries_payPeriodId_fkey" FOREIGN KEY ("payPeriodId") REFERENCES "pay_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_periods" ADD CONSTRAINT "pay_periods_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_compass_statements" ADD CONSTRAINT "pay_compass_statements_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_compass_statements" ADD CONSTRAINT "pay_compass_statements_payPeriodId_fkey" FOREIGN KEY ("payPeriodId") REFERENCES "pay_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_compass_statement_lines" ADD CONSTRAINT "pay_compass_statement_lines_compassStatementId_fkey" FOREIGN KEY ("compassStatementId") REFERENCES "pay_compass_statements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_compass_statement_lines" ADD CONSTRAINT "pay_compass_statement_lines_dentistId_fkey" FOREIGN KEY ("dentistId") REFERENCES "pay_dentists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_payslip_entries" ADD CONSTRAINT "pay_payslip_entries_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_payslip_entries" ADD CONSTRAINT "pay_payslip_entries_payPeriodId_fkey" FOREIGN KEY ("payPeriodId") REFERENCES "pay_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_payslip_entries" ADD CONSTRAINT "pay_payslip_entries_dentistId_fkey" FOREIGN KEY ("dentistId") REFERENCES "pay_dentists"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_private_revenue_line_items" ADD CONSTRAINT "pay_private_revenue_line_items_payslipEntryId_fkey" FOREIGN KEY ("payslipEntryId") REFERENCES "pay_payslip_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_private_revenue_line_items" ADD CONSTRAINT "pay_private_revenue_line_items_treatmentId_fkey" FOREIGN KEY ("treatmentId") REFERENCES "dentally_treatments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_lab_bill_entries" ADD CONSTRAINT "pay_lab_bill_entries_dentistId_fkey" FOREIGN KEY ("dentistId") REFERENCES "pay_dentists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_plans" ADD CONSTRAINT "plans_plans_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_patients" ADD CONSTRAINT "plans_patients_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_patients" ADD CONSTRAINT "plans_patients_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "dentally_patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_patients" ADD CONSTRAINT "plans_patients_planModelId_fkey" FOREIGN KEY ("planModelId") REFERENCES "plans_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_patient_plan_enrolments" ADD CONSTRAINT "plans_patient_plan_enrolments_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_patient_plan_enrolments" ADD CONSTRAINT "plans_patient_plan_enrolments_planPatientId_fkey" FOREIGN KEY ("planPatientId") REFERENCES "plans_patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_patient_plan_enrolments" ADD CONSTRAINT "plans_patient_plan_enrolments_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_mandates" ADD CONSTRAINT "plans_mandates_planPatientId_fkey" FOREIGN KEY ("planPatientId") REFERENCES "plans_patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_payments" ADD CONSTRAINT "plans_payments_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_payments" ADD CONSTRAINT "plans_payments_planPatientId_fkey" FOREIGN KEY ("planPatientId") REFERENCES "plans_patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_payments" ADD CONSTRAINT "plans_payments_patientPlanEnrolmentId_fkey" FOREIGN KEY ("patientPlanEnrolmentId") REFERENCES "plans_patient_plan_enrolments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_payments" ADD CONSTRAINT "plans_payments_mandateId_fkey" FOREIGN KEY ("mandateId") REFERENCES "plans_mandates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_document_acceptances" ADD CONSTRAINT "plans_document_acceptances_planPatientId_fkey" FOREIGN KEY ("planPatientId") REFERENCES "plans_patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plans_document_acceptances" ADD CONSTRAINT "plans_document_acceptances_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "plans_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_enquiries" ADD CONSTRAINT "flow_enquiries_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_enquiries" ADD CONSTRAINT "flow_enquiries_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "dentally_patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_consults" ADD CONSTRAINT "flow_consults_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_consults" ADD CONSTRAINT "flow_consults_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "flow_enquiries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_reminders" ADD CONSTRAINT "flow_reminders_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_reminders" ADD CONSTRAINT "flow_reminders_consultId_fkey" FOREIGN KEY ("consultId") REFERENCES "flow_consults"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

