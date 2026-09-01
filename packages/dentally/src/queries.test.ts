import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();

vi.mock("@elio/db", () => ({
  prisma: {
    dentallyPaymentPlan: {
      findMany: (...args: unknown[]) => findMany(...args),
    },
  },
}));

import { getPaymentPlans } from "./queries";

describe("getPaymentPlans", () => {
  beforeEach(() => {
    findMany.mockReset();
    findMany.mockResolvedValue([]);
  });

  it("scopes by practice and orders by name", async () => {
    await getPaymentPlans("practice-1");
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { practiceId: "practice-1" },
        orderBy: { name: "asc" },
      }),
    );
  });

  it("filters active plans when requested", async () => {
    await getPaymentPlans("practice-1", { active: true });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { practiceId: "practice-1", active: true },
      }),
    );
  });
});
