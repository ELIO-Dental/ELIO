import { describe, expect, it } from "vitest";
import { PlansDentallySyncConfigError } from "./plans-sync-errors";

describe("PlansDentallySyncConfigError", () => {
  it("carries details for API responses", () => {
    const err = new PlansDentallySyncConfigError("no plans", { mappedNames: ["A"] });
    expect(err.name).toBe("PlansDentallySyncConfigError");
    expect(err.details).toEqual({ mappedNames: ["A"] });
  });
});
