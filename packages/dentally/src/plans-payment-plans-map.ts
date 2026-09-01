import type { DentallyPaymentPlanRaw } from "./types";

export type LiveDentallyPaymentPlan = {
  id: number;
  name: string;
  patientFriendlyName?: string;
  active: boolean;
};

export function mapLiveDentallyPaymentPlan(raw: DentallyPaymentPlanRaw): LiveDentallyPaymentPlan {
  return {
    id: Number(raw.id),
    name: String(raw.name || ""),
    patientFriendlyName: raw.patient_friendly_name ? String(raw.patient_friendly_name) : undefined,
    active: raw.active !== false,
  };
}
