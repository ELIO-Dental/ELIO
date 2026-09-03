// Typed functions every OTHER package/module imports to read Dentally-sourced
// data — per FR-9: "no module should ever import an HTTP client and call
// Dentally directly; they import from packages/dentally only."
//
// These read ELIO's own synced-core tables (packages/db), NOT the live
// Dentally API — per project-docs/PERFORMANCE_SCALABILITY.md section 5:
// "Dentally-synced data is itself a cache of Dentally's data — no additional
// caching layer needed on top of the Postgres tables." The sync job
// (sync.ts) is what keeps this cache warm; callers never wait on a live
// Dentally round-trip for a data read.
//
// Every function is practiceId-scoped — never a bare cross-tenant query.

import { prisma } from "@elio/db";

export async function getPatient(practiceId: string, patientId: string) {
  return prisma.patient.findFirst({ where: { id: patientId, practiceId } });
}

export async function getPatients(
  practiceId: string,
  opts: { cursor?: string; take?: number } = {}
) {
  const take = Math.min(opts.take ?? 50, 200);
  return prisma.patient.findMany({
    where: { practiceId },
    take,
    ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    orderBy: { id: "asc" },
  });
}

export async function getAppointments(
  practiceId: string,
  opts: { patientId?: string; from?: Date; to?: Date; cursor?: string; take?: number } = {}
) {
  const take = Math.min(opts.take ?? 50, 200);
  return prisma.appointment.findMany({
    where: {
      practiceId,
      ...(opts.patientId ? { patientId: opts.patientId } : {}),
      ...(opts.from || opts.to
        ? { startsAt: { gte: opts.from, lt: opts.to } }
        : {}),
    },
    take,
    ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    orderBy: { id: "asc" },
  });
}

export async function getTreatments(
  practiceId: string,
  opts: { patientId?: string; from?: Date; to?: Date; cursor?: string; take?: number } = {}
) {
  const take = Math.min(opts.take ?? 50, 200);
  return prisma.treatment.findMany({
    where: {
      practiceId,
      ...(opts.patientId ? { patientId: opts.patientId } : {}),
      ...(opts.from || opts.to
        ? { completedAt: { gte: opts.from, lt: opts.to } }
        : {}),
    },
    take,
    ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    orderBy: { id: "asc" },
  });
}

export async function getInvoices(
  practiceId: string,
  opts: { patientId?: string; cursor?: string; take?: number } = {}
) {
  const take = Math.min(opts.take ?? 50, 200);
  return prisma.invoice.findMany({
    where: { practiceId, ...(opts.patientId ? { patientId: opts.patientId } : {}) },
    take,
    ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    orderBy: { id: "asc" },
  });
}

export async function getPayments(
  practiceId: string,
  opts: { patientId?: string; from?: Date; to?: Date; cursor?: string; take?: number } = {}
) {
  const take = Math.min(opts.take ?? 50, 200);
  return prisma.dentallyPayment.findMany({
    where: {
      practiceId,
      ...(opts.patientId ? { patientId: opts.patientId } : {}),
      ...(opts.from || opts.to ? { paidAt: { gte: opts.from, lt: opts.to } } : {}),
    },
    take,
    ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    orderBy: { paidAt: "asc" },
  });
}

/** All payments for a patient (paginated) — Flow financial sync must not cap at 200. */
export async function getAllPaymentsForPatient(practiceId: string, patientId: string) {
  const pageSize = 200;
  const all: Awaited<ReturnType<typeof getPayments>> = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await getPayments(practiceId, {
      patientId,
      take: pageSize,
      ...(cursor ? { cursor } : {}),
    });
    if (page.length === 0) break;
    all.push(...page);
    if (page.length < pageSize) break;
    cursor = page[page.length - 1]?.id;
  }
  return all;
}

export async function getAccounts(
  practiceId: string,
  opts: { patientId?: string; cursor?: string; take?: number } = {}
) {
  const take = Math.min(opts.take ?? 50, 200);
  return prisma.dentallyAccount.findMany({
    where: { practiceId, ...(opts.patientId ? { patientId: opts.patientId } : {}) },
    take,
    ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    orderBy: { id: "asc" },
  });
}

export async function getPaymentPlans(
  practiceId: string,
  opts: { active?: boolean; cursor?: string; take?: number } = {}
) {
  const take = Math.min(opts.take ?? 50, 200);
  return prisma.dentallyPaymentPlan.findMany({
    where: {
      practiceId,
      ...(opts.active !== undefined ? { active: opts.active } : {}),
    },
    take,
    ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    orderBy: { name: "asc" },
  });
}
