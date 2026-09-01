import { describe, expect, it } from "vitest";
import { hasBankDetails, normalizeBankDetails, normalizeSortCode } from "./saved-entity-bank";

describe("saved entity bank details (Y3.2)", () => {
  it("normalizes legacy snake_case bank fields", () => {
    const details = normalizeBankDetails({
      account_name: "Acme Lab Ltd",
      sort_code: "123456",
      account_number: "12345678",
    });
    expect(details.accountName).toBe("Acme Lab Ltd");
    expect(details.sortCode).toBe("12-34-56");
    expect(details.accountNumber).toBe("12345678");
    expect(hasBankDetails(details)).toBe(true);
  });

  it("formats sort codes with dashes", () => {
    expect(normalizeSortCode("20-30-40")).toBe("20-30-40");
  });
});
