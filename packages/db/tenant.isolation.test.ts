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
});

afterAll(async () => {
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

  it("sanity check: the RAW unscoped prisma client CAN see both practices (proves the test itself is real)", async () => {
    const all = await prisma.user.findMany({ where: { id: { in: [userAId, userBId] } } });
    expect(all.map((u) => u.id).sort()).toEqual([userAId, userBId].sort());
  });
});
