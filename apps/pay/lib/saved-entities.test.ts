import { describe, expect, it } from "vitest";
import { normalizeBankDetails } from "./saved-entity-bank";

describe("saved entities bank payload (Y3.2)", () => {
  it("accepts camelCase and snake_case bank fields for API bodies", () => {
    const fromApi = normalizeBankDetails({
      accountName: "Lab Co",
      sortCode: "112233",
      accountNumber: "99887766",
    });
    const fromLegacy = normalizeBankDetails({
      account_name: "Supplier Ltd",
      sort_code: "445566",
      account_number: "12345678",
    });
    expect(fromApi.accountName).toBe("Lab Co");
    expect(fromLegacy.sortCode).toBe("44-55-66");
  });
});
