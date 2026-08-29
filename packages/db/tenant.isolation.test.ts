// Integration test for docs/adr/0001-tenant-isolation-strategy.md: proves a
// query scoped to Practice A can NEVER return a row belonging to Practice B,
// even when the calling code passes NO explicit practiceId filter at all.
//
// Requires a real Postgres connection (DATABASE_URL) — this deliberately
// exercises the real scopedDb() wrapper against real rows, not a mock.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./client";
import { scopedDb } from "./tenant";

const RUN_ID = `test-${Date.now()}`;
const practiceAId = `${RUN_ID}-practice-a`;
const practiceBId = `${RUN_ID}-practice-b`;

let userAId: string;
let userBId: string;
let dentistAId: string;
let payPeriodAId: string;

beforeAll(async () => {
  await prisma.practice.create({ data: { id: practiceAId, name: `${RUN_ID} Practice A` } });
  await prisma.practice.create({ data: { id: practiceBId, name: `${RUN_ID} Practice B` } });

  const userA = await prisma.user.create({
    data: {
      email: `${RUN_ID}-a@example.com`,
      hashedPassword: "x",
      practiceId: practiceAId,
    },
  });
  const userB = await prisma.user.create({
    data: {
      email: `${RUN_ID}-b@example.com`,
      hashedPassword: "x",
      practiceId: practiceBId,
    },
  });
  userAId = userA.id;
  userBId = userB.id;

  // For the compound-unique upsert test below — mirrors F.1's real
  // PayslipEntry.upsert() fix (apps/pay/lib/pay-service.ts).
  const dentistA = await prisma.dentist.create({ data: { practiceId: practiceAId, name: `${RUN_ID} Dentist A`, payType: "HOURLY" } });
  const payPeriodA = await prisma.payPeriod.create({
    data: { practiceId: practiceAId, periodStart: new Date("2020-01-01"), periodEnd: new Date("2020-02-01"), status: "DRAFT" },
  });
  dentistAId = dentistA.id;
  payPeriodAId = payPeriodA.id;
});

afterAll(async () => {
  await prisma.payslipEntry.deleteMany({ where: { practiceId: { in: [practiceAId, practiceBId] } } });
  await prisma.payPeriod.deleteMany({ where: { id: payPeriodAId } });
  await prisma.dentist.deleteMany({ where: { id: dentistAId } });
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  await prisma.practice.deleteMany({ where: { id: { in: [practiceAId, practiceBId] } } });
  await prisma.$disconnect();
});

describe("tenant isolation (scopedDb)", () => {
  it("a bare findMany() with NO where clause, scoped to Practice A, never returns Practice B's row", async () => {
    const dbA = scopedDb(practiceAId);
    // Deliberately no `where` at all — this is the exact scenario FR-6 requires
    // to be impossible to get wrong: calling code that "forgot to filter".
    const users = await dbA.user.findMany({});
    const ids = users.map((u) => u.id);

    expect(ids).toContain(userAId);
    expect(ids).not.toContain(userBId);
  });

  it("findUnique by id alone cannot fetch another practice's row", async () => {
    const dbA = scopedDb(practiceAId);
    const found = await dbA.user.findUnique({ where: { id: userBId } });
    expect(found).toBeNull();
  });

  it("create() cannot be tricked into writing a different practice's id", async () => {
    const dbA = scopedDb(practiceAId);
    await expect(
      dbA.user.create({
        data: {
          email: `${RUN_ID}-hijack@example.com`,
          hashedPassword: "x",
          practiceId: practiceBId, // attempted cross-tenant write
        },
      }),
    ).rejects.toThrow(/refusing cross-tenant write/);
  });

  // F.3 Final QA (2026-08-29): tenant.ts's own $allOperations extension has
  // separate branches for upsert (WRITE_ONE_OPS) and createMany
  // (CREATE_MANY_OPS), each with their own cross-tenant-write guard — neither
  // was exercised by any test before this, a genuine coverage gap in the
  // single most security-critical file in this codebase. Matters concretely
  // now: F.1's own money-path fix (apps/pay/lib/pay-service.ts) added a real
  // scopedDb().payslipEntry.upsert() call this session.
  it("upsert() against a bare-id where cannot read or overwrite another practice's row (throws rather than silently succeeding)", async () => {
    const dbA = scopedDb(practiceAId);
    // The `where` clause alone can't smuggle a cross-tenant match: scopedDb's
    // merged where (id: userBId AND practiceId: practiceAId) is no longer a
    // valid unique lookup for a model whose only unique column is a bare
    // `id` — Prisma rejects it outright ("Record not found" / an invalid-
    // invocation error) rather than either (a) the deliberate "refusing
    // cross-tenant write" guard message, or (b) silently succeeding.
    // Documented here as a known rough edge (not a data-leak — Practice B's
    // row is provably untouched below, and the operation never completes
    // either way): every REAL scopedDb().upsert() call in this codebase
    // (apps/pay/lib/pay-service.ts's two PayslipEntry upserts, see the next
    // test) uses a compound unique key derived from a real dentist/period —
    // both already practice-owned via their own FKs — never a bare `id`,
    // so this exact shape doesn't occur on any real request path today.
    await expect(
      dbA.user.upsert({
        where: { id: userBId },
        update: { email: "should-not-apply@example.com" },
        create: { id: userBId, email: `${RUN_ID}-upsert-create@example.com`, hashedPassword: "x", practiceId: practiceAId },
      }),
    ).rejects.toThrow(/record.*not.*found|unique constraint/i);

    // Confirm Practice B's real user was never touched — the failure above
    // is a thrown error, not a completed cross-tenant read or write.
    const untouchedB = await prisma.user.findUniqueOrThrow({ where: { id: userBId } });
    expect(untouchedB.email).toBe(`${RUN_ID}-b@example.com`);
  });

  it("upsert() against a real compound-unique key (the actual shape used in production) is correctly scoped and idempotent", async () => {
    // Mirrors F.1's real fix exactly: apps/pay/lib/pay-service.ts's
    // PayslipEntry.upsert({ where: { payPeriodId_dentistId: {...} } }).
    const dbA = scopedDb(practiceAId);

    const first = await dbA.payslipEntry.upsert({
      where: { payPeriodId_dentistId: { payPeriodId: payPeriodAId, dentistId: dentistAId } },
      update: { hoursWorked: 5 },
      create: { practiceId: practiceAId, payPeriodId: payPeriodAId, dentistId: dentistAId, payType: "HOURLY", hoursWorked: 5 },
    });
    expect(Number(first.hoursWorked)).toBe(5);
    expect(first.practiceId).toBe(practiceAId);

    // Second call for the SAME real key updates the same row rather than
    // creating a duplicate — this is the exact race-safety property F.1's
    // fix exists to guarantee.
    const second = await dbA.payslipEntry.upsert({
      where: { payPeriodId_dentistId: { payPeriodId: payPeriodAId, dentistId: dentistAId } },
      update: { hoursWorked: 8 },
      create: { practiceId: practiceAId, payPeriodId: payPeriodAId, dentistId: dentistAId, payType: "HOURLY", hoursWorked: 8 },
    });
    expect(second.id).toBe(first.id);
    expect(Number(second.hoursWorked)).toBe(8);

    const allForThisPair = await prisma.payslipEntry.findMany({ where: { payPeriodId: payPeriodAId, dentistId: dentistAId } });
    expect(allForThisPair).toHaveLength(1);
  });

  it("upsert() cannot be tricked into CREATING a different practice's id", async () => {
    const dbA = scopedDb(practiceAId);
    await expect(
      dbA.user.upsert({
        where: { id: "a-genuinely-new-id-for-this-test" },
        update: {},
        create: {
          id: "a-genuinely-new-id-for-this-test",
          email: `${RUN_ID}-upsert-hijack@example.com`,
          hashedPassword: "x",
          practiceId: practiceBId, // attempted cross-tenant write
        },
      }),
    ).rejects.toThrow(/refusing cross-tenant write/);
  });

  it("createMany() cannot be tricked into writing a different practice's id", async () => {
    const dbA = scopedDb(practiceAId);
    await expect(
      dbA.user.createMany({
        // First row's own `practiceId` matches the scope — real callers
        // usually don't set it at all (see the next test), but Prisma's own
        // generated type requires SOME value per row since it has no
        // knowledge of scopedDb's runtime stamp-in behavior.
        data: [
          { email: `${RUN_ID}-many-ok@example.com`, hashedPassword: "x", practiceId: practiceAId },
          { email: `${RUN_ID}-many-hijack@example.com`, hashedPassword: "x", practiceId: practiceBId },
        ],
      }),
    ).rejects.toThrow(/refusing cross-tenant write/);

    // Neither row should have been created — Prisma's createMany is not
    // partial-success per call in this path (the guard throws before the
    // query ever reaches the DB).
    const created = await prisma.user.findMany({ where: { email: { in: [`${RUN_ID}-many-ok@example.com`, `${RUN_ID}-many-hijack@example.com`] } } });
    expect(created).toHaveLength(0);
  });

  it("createMany() stamps every row with the scoped practiceId when none is smuggled in", async () => {
    const dbA = scopedDb(practiceAId);
    // Deliberately omit practiceId here (cast to satisfy Prisma's own
    // generated type, which doesn't know scopedDb fills it in at runtime) —
    // this is the exact "caller forgot to set it" scenario FR-6 requires to
    // be impossible to get wrong.
    await dbA.user.createMany({
      data: [
        { email: `${RUN_ID}-many-a@example.com`, hashedPassword: "x" },
        { email: `${RUN_ID}-many-b@example.com`, hashedPassword: "x" },
      ] as { email: string; hashedPassword: string; practiceId: string }[],
    });
    const created = await prisma.user.findMany({ where: { email: { in: [`${RUN_ID}-many-a@example.com`, `${RUN_ID}-many-b@example.com`] } } });
    expect(created).toHaveLength(2);
    expect(created.every((u) => u.practiceId === practiceAId)).toBe(true);

    await prisma.user.deleteMany({ where: { id: { in: created.map((u) => u.id) } } });
  });

  it("sanity check: the RAW unscoped prisma client CAN see both practices (proves the test itself is real)", async () => {
    const all = await prisma.user.findMany({ where: { id: { in: [userAId, userBId] } } });
    expect(all.map((u) => u.id).sort()).toEqual([userAId, userBId].sort());
  });
});
