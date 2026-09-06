import { describe, expect, it } from "vitest";
import {
  applySharePence,
  parseRateToBasisPoints,
  parseShareToBasisPoints,
  toPence,
} from "./money-pence";

describe("money-pence (Step 20)", () => {
  it("parses share fractions and percents to basis points", () => {
    expect(parseShareToBasisPoints("0.5")).toBe(5000);
    expect(parseShareToBasisPoints("50")).toBe(5000);
    expect(parseShareToBasisPoints("0.6")).toBe(6000);
    expect(parseShareToBasisPoints("", 5000)).toBe(5000);
  });

  it("parses finance rates to basis points", () => {
    expect(parseRateToBasisPoints("0.08")).toBe(800);
    expect(parseRateToBasisPoints("8")).toBe(800);
    expect(parseRateToBasisPoints("0.045")).toBe(450);
  });

  it("applies share in integer pence", () => {
    expect(applySharePence(20000, 5000)).toBe(10000);
    expect(applySharePence(8000, 5000)).toBe(4000);
  });

  it("toPence rounds pounds to integer", () => {
    expect(toPence(12.345)).toBe(1235);
    expect(toPence("10.00")).toBe(1000);
  });
});
