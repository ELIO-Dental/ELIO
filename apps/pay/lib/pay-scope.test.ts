import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  filterPayslipsForScope,
  payslipMatchesPractitionerScope,
} from "./pay-scope-utils";
import {
  assertPayslipInScope,
  canPayDownloadAny,
  canPayViewAll,
  canPayViewAny,
  canPayViewOwn,
} from "./pay-scope";
import { ForbiddenError } from "./errors";

const findFirst = vi.fn();
vi.mock("@elio/db", () => ({
  scopedDb: () => ({
    payslipEntry: { findFirst },
    dentist: { findFirst: vi.fn() },
  }),
}));

describe("pay scope utils (Step 30)", () => {
  it("ops viewAll matches any payslip", () => {
    expect(
      payslipMatchesPractitionerScope({ dentistId: "d-1" }, { viewAll: true, dentistId: null })
    ).toBe(true);
  });

  it("clinician only matches own dentistId", () => {
    const scope = { viewAll: false, dentistId: "d-1" };
    expect(payslipMatchesPractitionerScope({ dentistId: "d-1" }, scope)).toBe(true);
    expect(payslipMatchesPractitionerScope({ dentistId: "d-2" }, scope)).toBe(false);
  });

  it("unlinked own-scope matches nothing", () => {
    expect(
      payslipMatchesPractitionerScope({ dentistId: "d-1" }, { viewAll: false, dentistId: null })
    ).toBe(false);
  });

  it("filters entry lists", () => {
    const entries = [{ dentistId: "d-1" }, { dentistId: "d-2" }];
    expect(filterPayslipsForScope(entries, { viewAll: true, dentistId: null })).toHaveLength(2);
    expect(filterPayslipsForScope(entries, { viewAll: false, dentistId: "d-1" })).toEqual([
      { dentistId: "d-1" },
    ]);
    expect(filterPayslipsForScope(entries, { viewAll: false, dentistId: null })).toEqual([]);
  });
});

describe("pay permission helpers (Step 30)", () => {
  it("ops roles can view all; STAFF can view own only", () => {
    expect(canPayViewAll({ role: "ADMIN" })).toBe(true);
    expect(canPayViewAll({ role: "STAFF" })).toBe(false);
    expect(canPayViewAny({ role: "STAFF" })).toBe(true);
    expect(canPayDownloadAny({ role: "STAFF" })).toBe(true);
    expect(canPayDownloadAny({ role: "ADMIN" })).toBe(true);
  });

  it("AUDITOR has view-all readonly", () => {
    expect(canPayViewAll({ role: "AUDITOR" })).toBe(true);
    expect(canPayViewOwn({ role: "AUDITOR" })).toBe(false);
  });
});

describe("assertPayslipInScope IDOR (Step 30)", () => {
  beforeEach(() => {
    findFirst.mockReset();
  });

  it("allows ops viewAll without DB lookup", async () => {
    await expect(
      assertPayslipInScope("p1", "slip-other", { viewAll: true, dentistId: null })
    ).resolves.toBeUndefined();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("allows clinician own dentist payslip", async () => {
    findFirst.mockResolvedValue({ dentistId: "d-self" });
    await expect(
      assertPayslipInScope("p1", "slip-own", { viewAll: false, dentistId: "d-self" })
    ).resolves.toBeUndefined();
  });

  it("403 when clinician requests another dentist payslip", async () => {
    findFirst.mockResolvedValue({ dentistId: "d-other" });
    await expect(
      assertPayslipInScope("p1", "slip-other", { viewAll: false, dentistId: "d-self" })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("403 when clinician has no linked dentistId", async () => {
    await expect(
      assertPayslipInScope("p1", "slip-any", { viewAll: false, dentistId: null })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("403 when payslip missing for clinician scope", async () => {
    findFirst.mockResolvedValue(null);
    await expect(
      assertPayslipInScope("p1", "missing", { viewAll: false, dentistId: "d-self" })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
