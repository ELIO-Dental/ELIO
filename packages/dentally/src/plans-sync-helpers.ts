export type SyncPatientShape = {
  dentallyId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  mobile: string | null;
  paymentPlanId: number | null;
  dateOfBirth: Date | null;
};

type PlanMapping = {
  dentallyPlanName: string;
  planModelId: string;
};

type PaymentPlanRef = {
  id: number;
  name: string;
};

export function matchPaymentPlanIds(mappings: PlanMapping[], paymentPlans: PaymentPlanRef[]): number[] {
  const mappedNames = mappings.map((m) => m.dentallyPlanName.trim().toLowerCase()).filter(Boolean);
  const ids: number[] = [];
  for (const plan of paymentPlans) {
    const name = plan.name.trim().toLowerCase();
    if (name && mappedNames.includes(name)) {
      ids.push(plan.id);
    }
  }
  return ids;
}

export function dedupePatientsByDentallyId<T extends { dentallyId: string }>(patients: T[]): T[] {
  const seen = new Set<string>();
  return patients.filter((p) => {
    if (!p.dentallyId || seen.has(p.dentallyId)) return false;
    seen.add(p.dentallyId);
    return true;
  });
}
