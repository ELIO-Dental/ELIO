/** Legacy-parity dashboard query shapes (P5.2). Mirrors ElioPlans `api/dashboard/stats/route.ts`. */

export function startOfCurrentMonth(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** Active member enrolment filter — legacy counts ACTIVE patientPlan + ACTIVE patient + ACTIVE mandate. */
export function activeMemberEnrolmentWhere(practiceId: string) {
  return {
    practiceId,
    status: "ACTIVE" as const,
    planPatient: {
      practiceId,
      status: "ACTIVE" as const,
      mandates: { some: { status: "ACTIVE" as const } },
    },
  };
}

/**
 * New signups this month — legacy uses `patient.signupCompletedAt >= startOfMonth`.
 * ELIO has no signupCompletedAt column; proxy = mandate linked this month OR free child enrolled.
 */
export function newSignupsPatientWhere(practiceId: string, startOfMonth: Date) {
  return {
    practiceId,
    status: "ACTIVE" as const,
    OR: [
      { mandates: { some: { status: "ACTIVE" as const, createdAt: { gte: startOfMonth } } } },
      {
        planModel: { monthlyPricePence: 0 },
        createdAt: { gte: startOfMonth },
      },
    ],
  };
}

/** Documents the legacy vs ELIO new-signup counting difference for staging verification. */
export const NEW_SIGNUPS_PARITY_NOTE =
  "Legacy counts patient.signupCompletedAt; ELIO proxies mandate.createdAt (ACTIVE) or free-plan enrolment createdAt.";
