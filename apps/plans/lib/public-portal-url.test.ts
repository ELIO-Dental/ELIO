import { afterEach, describe, expect, it } from "vitest";
import { absolutePortalUrl, getPublicPortalOrigin } from "./public-portal-url";

describe("public-portal-url", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_PORTAL_URL;
    delete process.env.PORTAL_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXTAUTH_URL;
    delete process.env.APP_URL;
    delete process.env.VERCEL_URL;
  });

  it("prefers portal URL over plans zone NEXTAUTH_URL", () => {
    process.env.NEXTAUTH_URL = "https://plans.elioportal.co.uk";
    process.env.NEXT_PUBLIC_PORTAL_URL = "https://app.elioportal.co.uk";
    expect(getPublicPortalOrigin()).toBe("https://app.elioportal.co.uk");
    expect(absolutePortalUrl("/plans/signup/abc")).toBe("https://app.elioportal.co.uk/plans/signup/abc");
  });

  it("leaves absolute URLs unchanged", () => {
    expect(absolutePortalUrl("https://app.elioportal.co.uk/plans/signup/x")).toBe(
      "https://app.elioportal.co.uk/plans/signup/x"
    );
  });
});
