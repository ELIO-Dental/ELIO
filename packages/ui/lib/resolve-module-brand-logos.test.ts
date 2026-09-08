import { describe, expect, it } from "vitest";
import { isDefaultModuleBrandLogo, resolveModuleBrandLogos } from "./resolve-module-brand-logos";

describe("resolveModuleBrandLogos", () => {
  it("uses ELIO product wordmarks when no upload", () => {
    const pay = resolveModuleBrandLogos("pay");
    expect(pay.usingCustom).toBe(false);
    expect(pay.logoOnly).toBe(true);
    expect(pay.logoUrl).toBe("/pay/brand/elio-pay.png");
    expect(pay.logoDarkUrl).toBe("/pay/brand/elio-pay-dark.png");

    expect(resolveModuleBrandLogos("plans").logoUrl).toBe("/plans/brand/elio-plans.png");
    expect(resolveModuleBrandLogos("flow").logoUrl).toBe("/flow/brand/elio-flow.png");
  });

  it("prefers practice upload over defaults", () => {
    const custom = resolveModuleBrandLogos("flow", "  https://cdn.example/logo.png  ");
    expect(custom.usingCustom).toBe(true);
    expect(custom.logoUrl).toBe("https://cdn.example/logo.png");
    expect(custom.logoDarkUrl).toBeUndefined();
    expect(custom.logoOnly).toBe(true);
  });

  it("detects default brand paths", () => {
    expect(isDefaultModuleBrandLogo("/pay/brand/elio-pay.png")).toBe(true);
    expect(isDefaultModuleBrandLogo("/flow/brand/elio-flow-dark.png")).toBe(true);
    expect(isDefaultModuleBrandLogo("https://cdn.example/logo.png")).toBe(false);
  });
});
