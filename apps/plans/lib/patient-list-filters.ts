import type { Prisma } from "@elio/db";

type MandateLike = { status: string };

type PlanPatientLike = {
  status: string;
  mandates: MandateLike[];
  planModel?: { monthlyPricePence: number } | null;
};

/** Derived: ACTIVE paid plan with no active GoCardless mandate (legacy PENDING_DD). */
export function isPendingDirectDebit(pp: PlanPatientLike): boolean {
  return (
    pp.status === "ACTIVE" &&
    !pp.mandates.some((m) => m.status === "ACTIVE") &&
    (pp.planModel?.monthlyPricePence ?? 0) > 0
  );
}

export function derivePatientDisplayStatus(pp: PlanPatientLike): string {
  return isPendingDirectDebit(pp) ? "PENDING_DD" : pp.status;
}

/** Free (£0) plans require linking to an active adult member (legacy P2.8). */
export function isFreeChildPlan(plan: { monthlyPricePence: number }): boolean {
  return plan.monthlyPricePence === 0;
}

export function buildPlanPatientListWhere(
  practiceId: string,
  options?: { q?: string; status?: string },
): Prisma.PlanPatientWhereInput {
  const q = options?.q?.trim();
  const status = options?.status?.trim();

  const search: Prisma.PlanPatientWhereInput = q
    ? {
        patient: {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        },
      }
    : {};

  if (status === "PENDING_DD") {
    return {
      practiceId,
      ...search,
      status: "ACTIVE",
      planModel: { monthlyPricePence: { gt: 0 } },
      mandates: { none: { status: "ACTIVE" } },
    };
  }

  if (status) {
    return {
      practiceId,
      ...search,
      status: status as "INVITED" | "SIGNED" | "ACTIVE" | "PAUSED" | "CANCELLED",
    };
  }

  return { practiceId, ...search };
}
