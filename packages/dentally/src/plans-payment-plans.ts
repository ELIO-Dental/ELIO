import type { DentallyClient } from "./client";
import { getDentallyClientForPractice } from "./resolve-api-key";
import { mapLiveDentallyPaymentPlan, type LiveDentallyPaymentPlan } from "./plans-payment-plans-map";
import type { DentallyPaymentPlanRaw } from "./types";

export { mapLiveDentallyPaymentPlan, type LiveDentallyPaymentPlan } from "./plans-payment-plans-map";

export async function fetchLiveDentallyPaymentPlans(practiceId: string): Promise<LiveDentallyPaymentPlan[]> {
  const client = await getDentallyClientForPractice(practiceId);
  return fetchLiveDentallyPaymentPlansWithClient(client);
}

export async function fetchLiveDentallyPaymentPlansWithClient(
  client: DentallyClient,
): Promise<LiveDentallyPaymentPlan[]> {
  const plans: LiveDentallyPaymentPlan[] = [];
  await client.paginate<DentallyPaymentPlanRaw>(
    "/payment_plans",
    "payment_plans",
    {},
    (page) => {
      for (const raw of page) {
        plans.push(mapLiveDentallyPaymentPlan(raw));
      }
    },
  );
  return plans;
}
