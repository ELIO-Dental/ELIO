import { describe, expect, it } from "vitest";

/** Mirrors payslip-accordion.tsx subtitle logic for Y2.3 parity tests. */
export function formatPayslipAccordionSubtitle(parts: {
  privateSplitPercent: string | null;
  isNhs: boolean;
  patientCount: number;
}): string {
  const segments: string[] = [];
  if (parts.privateSplitPercent != null) segments.push(`${parts.privateSplitPercent}% split`);
  if (parts.isNhs) segments.push("NHS");
  if (parts.patientCount > 0) segments.push(`${parts.patientCount} patients`);
  return segments.join(" · ");
}

export function dentistInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}
