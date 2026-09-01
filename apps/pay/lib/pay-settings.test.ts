import { describe, expect, it } from "vitest";
import {
  defaultPaySettings,
  mergePaySettingsInput,
  parsePaySettingsJson,
  resolveDentallySiteId,
  resolveNhsAmountSet,
  resolveTherapistIdSet,
  resolveTherapyRatePerMinute,
  syncTherapyRates,
} from "./pay-settings";

describe("pay settings (Y3.5)", () => {
  it("applies defaults and merges cosmetic consultation code from practice", () => {
    const settings = parsePaySettingsJson(null, {
      practiceName: "Aura Dental",
      cosmeticConsultationTreatmentCode: "COSM01",
    });
    expect(settings.clinic_name).toBe("Aura Dental");
    expect(settings.cosmetic_consultation_treatment_code).toBe("COSM01");
    expect(settings.therapy_rate).toBe("0.5833");
  });

  it("syncs hourly and per-minute therapy rates", () => {
    const synced = syncTherapyRates(
      { ...defaultPaySettings(), therapy_hourly_rate: "60", therapy_rate: "0" },
      "hourly"
    );
    expect(synced.therapy_rate).toBe("1.0000");
  });

  it("merges partial updates", () => {
    const base = defaultPaySettings();
    const next = mergePaySettingsInput(base, { therapist_ids: "1,2,3", lab_bill_split: "0.6" });
    expect(next.therapist_ids).toBe("1,2,3");
    expect(next.lab_bill_split).toBe("0.6");
  });

  it("resolves therapist IDs and NHS amounts from settings", () => {
    const settings = mergePaySettingsInput(defaultPaySettings(), {
      therapist_ids: "111;222",
      nhs_amounts: "27.40,75.30",
      dentally_site_id: "site-uuid",
      therapy_rate: "0.75",
    });
    expect([...resolveTherapistIdSet(settings)]).toEqual(["111", "222"]);
    expect([...resolveNhsAmountSet(settings)]).toEqual([27.4, 75.3]);
    expect(resolveDentallySiteId(settings)).toBe("site-uuid");
    expect(resolveTherapyRatePerMinute(settings)).toBe(0.75);
  });
});
