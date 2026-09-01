import { describe, expect, it } from "vitest";
import { buildUnmatchedInvoiceIds, mapDentallyDebugUser } from "./dentally-debug-helpers";

describe("dentally debug (Y3.6)", () => {
  it("maps Dentally user records", () => {
    const user = mapDentallyDebugUser({
      id: 189342,
      first_name: "Sarah",
      last_name: "Jones",
      email: "sarah@clinic.com",
      role: "dentist",
    });
    expect(user.id).toBe("189342");
    expect(user.name).toBe("Sarah Jones");
    expect(user.email).toBe("sarah@clinic.com");
    expect(user.active).toBe(true);
  });

  it("lists invoice practitioner IDs not mapped to stored dentists", () => {
    const unmatched = buildUnmatchedInvoiceIds(
      {
        "111": { count: 3, totalAmount: 500, name: "Dr A" },
        "222": { count: 1, totalAmount: 100, name: "Dr B" },
      },
      new Set(["222"])
    );
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0]?.id).toBe("111");
    expect(unmatched[0]?.count).toBe(3);
  });
});
