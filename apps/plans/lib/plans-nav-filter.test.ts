import { describe, expect, it } from "vitest";
import { filterPlansNavItems } from "./plans-nav-filter";

const SAMPLE_NAV = [
  { id: "dashboard" },
  { id: "patients" },
  { id: "dentally" },
  { id: "plans" },
  { id: "payments" },
  { id: "reconciliation" },
  { id: "redeems" },
  { id: "reports" },
  { id: "documents" },
  { id: "guide" },
  { id: "action-required" },
  { id: "audit-log" },
  { id: "users" },
  { id: "settings" },
];

describe("filterPlansNavItems", () => {
  it("always keeps dashboard, patients, plans, guide", () => {
    const ids = filterPlansNavItems(SAMPLE_NAV, {
      canViewPayments: false,
      canEditSettings: false,
      canViewActionRequired: false,
      canViewAuditLog: false,
      canManageTeam: false,
    }).map((i) => i.id);
    expect(ids).toEqual(["dashboard", "patients", "plans", "guide"]);
  });

  it("shows payments group when canViewPayments", () => {
    const ids = filterPlansNavItems(SAMPLE_NAV, {
      canViewPayments: true,
      canEditSettings: false,
      canViewActionRequired: false,
      canViewAuditLog: false,
      canManageTeam: false,
    }).map((i) => i.id);
    expect(ids).toContain("payments");
    expect(ids).toContain("redeems");
    expect(ids).not.toContain("settings");
    expect(ids).not.toContain("users");
  });

  it("shows settings/dentally/documents only with canEditSettings", () => {
    const ids = filterPlansNavItems(SAMPLE_NAV, {
      canViewPayments: false,
      canEditSettings: true,
      canViewActionRequired: false,
      canViewAuditLog: false,
      canManageTeam: false,
    }).map((i) => i.id);
    expect(ids).toContain("settings");
    expect(ids).toContain("dentally");
    expect(ids).toContain("documents");
    expect(ids).not.toContain("payments");
  });

  it("never shows users (Portal Team owns roster) even with canManageTeam", () => {
    const ids = filterPlansNavItems(SAMPLE_NAV, {
      canViewPayments: true,
      canEditSettings: true,
      canViewActionRequired: true,
      canViewAuditLog: true,
      canManageTeam: true,
    }).map((i) => i.id);
    expect(ids).toContain("audit-log");
    expect(ids).not.toContain("users");
    expect(ids).toContain("action-required");
  });
});
