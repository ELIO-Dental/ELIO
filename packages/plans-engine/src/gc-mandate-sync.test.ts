import { describe, expect, it } from "vitest";
import { classifyGcMandatePollStatus } from "./gc-mandate-sync";

describe("classifyGcMandatePollStatus", () => {
  it("treats in-flight statuses as unchanged", () => {
    expect(classifyGcMandatePollStatus("pending_submission")).toBe("unchanged");
    expect(classifyGcMandatePollStatus("submitted")).toBe("unchanged");
    expect(classifyGcMandatePollStatus(undefined)).toBe("unchanged");
  });

  it("activates active mandates", () => {
    expect(classifyGcMandatePollStatus("active")).toBe("activate");
  });

  it("fails failed mandates", () => {
    expect(classifyGcMandatePollStatus("failed")).toBe("fail");
  });

  it("cancels cancelled or expired mandates", () => {
    expect(classifyGcMandatePollStatus("cancelled")).toBe("cancel");
    expect(classifyGcMandatePollStatus("expired")).toBe("cancel");
  });
});
