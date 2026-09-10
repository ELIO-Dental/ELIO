import type { Prisma } from "@elio/db";

/** True for dentists seeded by UAT/E2E — never show in live UI. */
export function isUatOrE2eDentistName(name: string): boolean {
  const n = name.trim();
  return (
    n.startsWith("[UAT]") ||
    n.startsWith("UAT ") ||
    n.startsWith("UAT Pay") ||
    n.startsWith("UAT Email") ||
    n.startsWith("E2E ") ||
    n.startsWith("E2E Dentally") ||
    /^E2E Dentally/i.test(n) ||
    /^UAT Pay Dentist/i.test(n) ||
    /^UAT Email Dentist/i.test(n)
  );
}

/** Hide UAT/E2E junk rows from all dentist pickers / lists. */
export const NON_UAT_DENTIST_WHERE: Prisma.DentistWhereInput = {
  AND: [
    { NOT: { name: { startsWith: "[UAT]" } } },
    { NOT: { name: { startsWith: "UAT " } } },
    { NOT: { name: { startsWith: "E2E " } } },
  ],
};

/** Live payroll / seeding: active dentists only (AuraPay `active = 1`). */
export const ACTIVE_DENTIST_WHERE: Prisma.DentistWhereInput = {
  AND: [{ active: true }, NON_UAT_DENTIST_WHERE],
};

/** Dentists management table: active + inactive (still hide UAT). */
export const MANAGED_DENTIST_WHERE: Prisma.DentistWhereInput = NON_UAT_DENTIST_WHERE;
