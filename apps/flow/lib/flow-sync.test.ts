import { describe, expect, it } from "vitest";
import { parseFlowDentallySyncMode } from "./flow-sync";

describe("parseFlowDentallySyncMode", () => {
  it("defaults to full", () => {
    expect(parseFlowDentallySyncMode(undefined)).toBe("full");
    expect(parseFlowDentallySyncMode("full")).toBe("full");
  });

  it("accepts payments mode", () => {
    expect(parseFlowDentallySyncMode("payments")).toBe("payments");
  });
});
