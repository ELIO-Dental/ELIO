// Shared Prisma client — full multi-tenant schema, Step 1.3.
// project-docs/DATA_MODEL.md is the field-name contract this implements.
//
// IMPORTANT: `prisma` (this raw, unscoped client) must NOT be used directly by
// module request code for tenant-owned data — use `scopedDb(practiceId)` from
// ./tenant instead (see docs/adr/0001-tenant-isolation-strategy.md). The raw
// client is for: the seed script, migration tooling, and apps/admin's
// legitimately cross-tenant Super Admin views.
export { prisma } from "./client";
export * from "./generated/client";
export { scopedDb } from "./tenant";
export type { ScopedDb } from "./tenant";
