// Raw Prisma client singleton — split into its own module (no other local
// imports) so both index.ts and tenant.ts can depend on it without a
// circular-import cycle between the two.
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
