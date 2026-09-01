import type { DentallyPatientRaw } from "./types";

export type DentallySearchPatient = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth?: string;
  phone?: string;
  mobile?: string;
  paymentPlanId?: number;
  active: boolean;
};

export function mapDentallySearchPatient(raw: DentallyPatientRaw): DentallySearchPatient {
  return {
    id: String(raw.id),
    firstName: String(raw.first_name ?? ""),
    lastName: String(raw.last_name ?? ""),
    email: String(raw.email_address ?? ""),
    dateOfBirth: raw.date_of_birth ? String(raw.date_of_birth) : undefined,
    phone: raw.home_phone ? String(raw.home_phone) : undefined,
    mobile: raw.mobile_phone ? String(raw.mobile_phone) : undefined,
    paymentPlanId: raw.payment_plan_id != null ? Number(raw.payment_plan_id) : undefined,
    active: raw.active !== false,
  };
}
