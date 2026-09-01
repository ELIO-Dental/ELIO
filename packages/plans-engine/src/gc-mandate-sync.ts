/**
 * Pure helpers for polling GoCardless mandate status (P1.8 gc-sync cron).
 */

export type GcMandatePollOutcome = "unchanged" | "activate" | "fail" | "cancel";

export function classifyGcMandatePollStatus(gcStatus: string | undefined): GcMandatePollOutcome {
  if (!gcStatus || gcStatus === "pending_submission" || gcStatus === "submitted") {
    return "unchanged";
  }
  if (gcStatus === "active") return "activate";
  if (gcStatus === "failed") return "fail";
  if (gcStatus === "cancelled" || gcStatus === "expired") return "cancel";
  return "unchanged";
}
