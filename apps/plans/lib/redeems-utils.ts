import type { PlanRedeemItemType } from "@elio/db";

/** Map Dentally appointment reason text to redeem item type (legacy parity). */
export function itemTypeFromAppointmentReason(reason: string | null | undefined): {
  itemType: PlanRedeemItemType;
  itemName: string;
} {
  const text = (reason ?? "").toLowerCase();
  if (text.includes("exam") || text.includes("check")) {
    return { itemType: "EXAMINATION", itemName: "Dental Examination" };
  }
  if (text.includes("hygien") || text.includes("scale") || text.includes("clean")) {
    return { itemType: "HYGIENE", itemName: reason?.trim() || "Hygiene" };
  }
  return { itemType: "OTHER", itemName: reason?.trim() || "Other" };
}

export function isRedeemableAppointmentState(state: string | null | undefined): boolean {
  if (!state) return false;
  const normalized = state.toLowerCase();
  return normalized === "completed" || normalized === "in surgery";
}
