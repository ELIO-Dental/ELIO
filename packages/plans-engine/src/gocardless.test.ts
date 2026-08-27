import { describe, it, expect } from "vitest";
import { isLiveSubscriptionStatus, findReusableSubscription, mapMandateStatus, mapPaymentStatus } from "./gocardless";

/**
 * Regression tests for the double-charging bug, ported directly from ElioPlans'
 * src/lib/gocardless.test.ts.
 *
 * Eleven live patients were found in ElioPlans production with two active
 * subscriptions on a single mandate, each billed twice a month. The cause:
 * multiple separate code paths call createSubscription, and several could run
 * for the same patient (e.g. signup creates one, then the mandates.active
 * webhook creates another). The guard now lives inside createSubscription so no
 * call site can bypass it; these tests cover the decision rule it uses.
 */

describe("isLiveSubscriptionStatus", () => {
  it.each(["active", "pending_customer_approval", "paused"])(
    "treats %s as live (a second subscription would double-charge)",
    (status) => {
      expect(isLiveSubscriptionStatus(status)).toBe(true);
    }
  );

  it.each(["cancelled", "finished", "customer_approval_denied", undefined])(
    "treats %s as not live (safe to create a new subscription)",
    (status) => {
      expect(isLiveSubscriptionStatus(status)).toBe(false);
    }
  );
});

describe("findReusableSubscription", () => {
  it("returns null when the mandate has no subscriptions", () => {
    expect(findReusableSubscription([])).toBeNull();
  });

  it("returns the live subscription so it is reused, not duplicated", () => {
    const existing = [{ id: "SB_EXISTING", status: "active" }];
    expect(findReusableSubscription(existing)?.id).toBe("SB_EXISTING");
  });

  it("returns null when every existing subscription is cancelled or finished", () => {
    const existing = [
      { id: "SB_OLD", status: "cancelled" },
      { id: "SB_DONE", status: "finished" },
    ];
    expect(findReusableSubscription(existing)).toBeNull();
  });

  it("ignores cancelled entries and reuses the live one", () => {
    const existing = [
      { id: "SB_OLD", status: "cancelled" },
      { id: "SB_LIVE", status: "active" },
    ];
    expect(findReusableSubscription(existing)?.id).toBe("SB_LIVE");
  });

  it("reproduces the live failure: signup then webhook must not duplicate", () => {
    // Signup runs first against a clean mandate -> nothing to reuse, so create.
    expect(findReusableSubscription([])).toBeNull();

    // The mandates.active webhook arrives moments later and GoCardless now
    // reports the subscription signup just made. Previously a second was created
    // here and the patient was billed double.
    const afterSignup = [{ id: "SB_FIRST", status: "active" }];
    expect(findReusableSubscription(afterSignup)?.id).toBe("SB_FIRST");
  });

  it("matches the real duplicate pairs found in production", () => {
    const existing = [{ id: "SB01KS2YAV4W6C7TS8G4KFXARH06", status: "active" }];
    // With the guard in place the second call reuses the original.
    expect(findReusableSubscription(existing)?.id).toBe("SB01KS2YAV4W6C7TS8G4KFXARH06");
  });
});

describe("mapMandateStatus", () => {
  it("maps every GoCardless mandate status to a PlanMandateStatus value", () => {
    expect(mapMandateStatus("pending_submission")).toBe("PENDING");
    expect(mapMandateStatus("submitted")).toBe("PENDING");
    expect(mapMandateStatus("active")).toBe("ACTIVE");
    expect(mapMandateStatus("failed")).toBe("FAILED");
    expect(mapMandateStatus("cancelled")).toBe("CANCELLED");
    expect(mapMandateStatus("expired")).toBe("EXPIRED");
  });

  it("defaults unknown statuses to PENDING rather than throwing", () => {
    expect(mapMandateStatus("some_future_status")).toBe("PENDING");
  });
});

describe("mapPaymentStatus", () => {
  it("maps every GoCardless payment status to a PlanPaymentStatus value", () => {
    expect(mapPaymentStatus("pending_submission")).toBe("PENDING");
    expect(mapPaymentStatus("submitted")).toBe("PENDING");
    expect(mapPaymentStatus("confirmed")).toBe("CONFIRMED");
    expect(mapPaymentStatus("paid_out")).toBe("PAID_OUT");
    expect(mapPaymentStatus("failed")).toBe("FAILED");
    expect(mapPaymentStatus("cancelled")).toBe("CANCELLED");
    expect(mapPaymentStatus("charged_back")).toBe("CHARGED_BACK");
  });

  it("defaults unknown statuses to PENDING rather than throwing", () => {
    expect(mapPaymentStatus("some_future_status")).toBe("PENDING");
  });
});
