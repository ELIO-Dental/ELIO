import type { Prisma } from "@elio/db";

/** Hide UAT junk rows from all dentist pickers / lists. */
export const NON_UAT_DENTIST_WHERE: Prisma.DentistWhereInput = {
  NOT: { name: { startsWith: "[UAT]" } },
};

/** Live payroll / seeding: active dentists only (AuraPay `active = 1`). */
export const ACTIVE_DENTIST_WHERE: Prisma.DentistWhereInput = {
  AND: [{ active: true }, NON_UAT_DENTIST_WHERE],
};

/** Dentists management table: active + inactive (still hide UAT). */
export const MANAGED_DENTIST_WHERE: Prisma.DentistWhereInput = NON_UAT_DENTIST_WHERE;
