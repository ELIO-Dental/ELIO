import type { Prisma } from "@elio/db";

/** Client-facing dentist list: hide removed (Angelica) and UAT junk rows. */
export const ACTIVE_DENTIST_WHERE: Prisma.DentistWhereInput = {
  AND: [
    { NOT: { name: { startsWith: "[REMOVED]" } } },
    { NOT: { name: { startsWith: "[UAT]" } } },
  ],
};
