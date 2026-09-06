import type { ModuleNavLink } from "@elio/ui";

const ALWAYS_NAV_IDS = new Set(["dashboard", "patients", "plans", "guide"]);
const PAYMENTS_NAV_IDS = new Set(["payments", "reconciliation", "reports", "redeems"]);
const SETTINGS_NAV_IDS = new Set(["documents", "settings", "dentally"]);

export interface PlansNavPermissions {
  canViewPayments: boolean;
  canEditSettings: boolean;
  canViewActionRequired: boolean;
  canViewAuditLog: boolean;
  canManageTeam: boolean;
}

/** Filter Plans sidebar items by permission flags (Aura Plans role gating parity). */
export function filterPlansNavItems<T extends { id: string }>(
  items: readonly T[],
  perms: PlansNavPermissions
): T[] {
  return items.filter((item) => {
    if (ALWAYS_NAV_IDS.has(item.id)) return true;
    if (PAYMENTS_NAV_IDS.has(item.id)) return perms.canViewPayments;
    if (SETTINGS_NAV_IDS.has(item.id)) return perms.canEditSettings;
    if (item.id === "action-required") return perms.canViewActionRequired;
    if (item.id === "audit-log") return perms.canViewAuditLog;
    if (item.id === "users") return perms.canManageTeam;
    return false;
  });
}

/** Type alias kept for call-site clarity with ModuleAppLayout. */
export type PlansNavItem = ModuleNavLink;
