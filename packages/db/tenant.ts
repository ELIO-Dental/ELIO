// Tenant isolation query-wrapper — see docs/adr/0001-tenant-isolation-strategy.md
// for why this exists instead of PostgreSQL RLS.
//
// Every module MUST obtain its Prisma client via scopedDb(practiceId) for any
// request that touches tenant-owned data. It guarantees practiceId is present
// in every read/update/delete filter and every create payload for models that
// carry a practiceId column, REGARDLESS of what the calling code passes in —
// including a bare findMany() with no `where` at all.
import { prisma as rawPrisma } from "./client";

// Every Prisma model name (as it appears in `prisma.<model>` / DMMF uncapitalized
// form) that carries a practiceId column. Kept as an explicit allowlist —
// deliberately not "every model except a denylist" — so a newly added
// tenant-owned model that forgets to update this list fails LOUD (via the
// integration test) instead of silently shipping unscoped.
const TENANT_SCOPED_MODELS = new Set([
  "user",
  "passwordResetToken",
  "auditLog",
  "licence",
  "practiceFeatureFlag",
  "impersonationSession",
  "patient",
  "appointment",
  "treatment",
  "invoice",
  "dentist",
  "hourEntry",
  "payPeriod",
  "compassStatement",
  // NOTE: "payLine" is deliberately NOT listed here — the PayLine model (table
  // pay_compass_statement_lines) has no practiceId column of its own (DATA_MODEL.md
  // §3 scopes it transitively through compassStatementId -> CompassStatement.practiceId).
  // Adding it to this allowlist breaks every real query (Prisma errors: "Unknown
  // argument practiceId") — found and fixed during Step 1.6 wiring/verification.
  // Callers MUST scope PayLine reads/writes manually via compassStatement.payPeriodId
  // or compassStatement.practiceId in their own where-clause (as apps/pay's routes do).
  "payslipEntry",
  "labBillEntry",
  "planModel",
  "planPatient",
  "patientPlanEnrolment",
  "planMandate",
  "planPayment",
  "planDocumentAcceptance",
  "enquiry",
  "consult",
  "reminder",
  // Found live (2026-08-28, independent Phase 1 audit): these 13 models all
  // carry a direct practiceId column (confirmed against schema.prisma) but
  // were missing from this allowlist, so every scopedDb() call against them
  // silently ran completely UNSCOPED — no practiceId filter injected at all.
  // Confirmed live unscoped call sites in apps/plans/lib/plans-service.ts
  // (planDocument.findFirst, planSigningRequest.create/update,
  // planRedeem.findMany/findUnique/update) — a real, plausible cross-tenant
  // read/write path on plan documents, e-signing requests, and redemptions.
  "planDocument",
  "planSigningRequest",
  "planRedeem",
  "planRedeemRule",
  "planInclusion",
  "planDiscount",
  "planEligibilityRule",
  "planGuideArticle",
  "savedLab",
  "savedSupplier",
  "supplierInvoiceEntry",
  "legacyPayslipArchive",
  "legacyFlowTouchPointArchive",
  "dentallySyncRun",
  "dentallyPayment",
  "dentallyAccount",
  "dentallyPaymentPlan",
  "dentallyPlanMapping",
  "planPatientNote",
  "planEmailLog",
  "planPracticeSetting",
]);

const READ_OPS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
]);
const WRITE_MANY_OPS = new Set(["updateMany", "deleteMany"]);
const WRITE_ONE_OPS = new Set(["update", "delete", "upsert"]);
const CREATE_OPS = new Set(["create"]);
const CREATE_MANY_OPS = new Set(["createMany"]);

function mergeWhere(where: unknown, practiceId: string) {
  return { ...(where as object | undefined), practiceId };
}

/**
 * Returns a Prisma Client bound to exactly one practice. Every operation
 * against a tenant-scoped model is forced to filter/tag with this
 * practiceId, even if the caller's own args forgot to.
 */
export function scopedDb(practiceId: string) {
  if (!practiceId) {
    throw new Error("scopedDb() requires a non-empty practiceId");
  }

  return rawPrisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const modelKey = model && model.length > 0 ? model[0]!.toLowerCase() + model.slice(1) : undefined;
          if (!modelKey || !TENANT_SCOPED_MODELS.has(modelKey)) {
            return query(args);
          }

          const a = (args ?? {}) as Record<string, unknown>;

          if (READ_OPS.has(operation) || WRITE_MANY_OPS.has(operation)) {
            a.where = mergeWhere(a.where, practiceId);
          } else if (WRITE_ONE_OPS.has(operation)) {
            a.where = mergeWhere(a.where, practiceId);
            if (operation === "upsert" && a.create) {
              const create = a.create as Record<string, unknown>;
              if (create.practiceId && create.practiceId !== practiceId) {
                throw new Error(
                  `scopedDb: attempted to create ${model} with practiceId "${create.practiceId}" ` +
                    `while scoped to "${practiceId}" — refusing cross-tenant write.`,
                );
              }
              create.practiceId = practiceId;
            }
          } else if (CREATE_OPS.has(operation)) {
            const data = (a.data ?? {}) as Record<string, unknown>;
            if (data.practiceId && data.practiceId !== practiceId) {
              throw new Error(
                `scopedDb: attempted to create ${model} with practiceId "${data.practiceId}" ` +
                  `while scoped to "${practiceId}" — refusing cross-tenant write.`,
              );
            }
            data.practiceId = practiceId;
            a.data = data;
          } else if (CREATE_MANY_OPS.has(operation)) {
            const data = a.data as Record<string, unknown>[] | undefined;
            if (Array.isArray(data)) {
              a.data = data.map((row) => {
                if (row.practiceId && row.practiceId !== practiceId) {
                  throw new Error(
                    `scopedDb: attempted createMany on ${model} with a row practiceId ` +
                      `"${row.practiceId}" while scoped to "${practiceId}" — refusing cross-tenant write.`,
                  );
                }
                return { ...row, practiceId };
              });
            }
          }

          return query(a);
        },
      },
    },
  });
}

export type ScopedDb = ReturnType<typeof scopedDb>;
export { TENANT_SCOPED_MODELS };
