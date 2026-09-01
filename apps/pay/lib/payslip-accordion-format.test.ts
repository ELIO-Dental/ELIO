import { describe, expect, it } from "vitest";
import { dentistInitials, formatPayslipAccordionSubtitle } from "./payslip-accordion-format";

describe("payslip accordion helpers (Y2.3)", () => {
  it("builds collapsed subtitle with split, NHS, and patient count", () => {
    expect(
      formatPayslipAccordionSubtitle({
        privateSplitPercent: "50",
        isNhs: true,
        patientCount: 12,
      })
    ).toBe("50% split · NHS · 12 patients");
  });

  it("omits empty segments", () => {
    expect(
      formatPayslipAccordionSubtitle({
        privateSplitPercent: null,
        isNhs: false,
        patientCount: 0,
      })
    ).toBe("");
  });

  it("derives initials from dentist name", () => {
    expect(dentistInitials("Jane Smith")).toBe("JS");
    expect(dentistInitials("Madonna")).toBe("M");
  });
});
