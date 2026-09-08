"use client";

import { usePathname } from "next/navigation";
import { getModuleColor } from "@elio/ui";

/** Legacy top-tab fallback — keep in sync with PLANS_MODULE_NAV (no Users; Portal owns Team). */
const LINKS = [
  { href: "/plans/dashboard", label: "Dashboard" },
  { href: "/plans/patients", label: "Patients" },
  { href: "/plans/plans", label: "Plans" },
  { href: "/plans/redeems", label: "Redeems" },
  { href: "/plans/payments", label: "Payments" },
  { href: "/plans/reconciliation", label: "Reconciliation" },
  { href: "/plans/dentally", label: "Dentally" },
  { href: "/plans/documents", label: "Documents" },
  { href: "/plans/reports", label: "Reports" },
  { href: "/plans/action-required", label: "Action Required" },
  { href: "/plans/guide", label: "Guide" },
  { href: "/plans/audit-log", label: "Audit Log" },
  { href: "/plans/settings", label: "Settings" },
];

/**
 * Module-local sub-nav — mirrors the former apps/pay/components/pay-nav.tsx pattern
 * (Pay now uses PAY_MODULE_NAV via ModuleAppLayout).
 */
export function PlansNav() {
  const pathname = usePathname();
  const color = getModuleColor("plans");

  return (
    <div className="border-b border-(--color-border)" style={{ borderTopColor: color.accentBorder, borderTopWidth: 2 }}>
      <nav className="mx-auto flex max-w-6xl flex-wrap gap-1 px-6">
        {LINKS.map((link) => {
          const active = pathname?.startsWith(link.href);
          return (
            <a
              key={link.href}
              href={link.href}
              className="relative flex h-12 items-center px-3 text-body-sm font-medium text-(--color-text-secondary) transition-colors hover:text-(--color-text-primary)"
              style={active ? { color: color.hex } : undefined}
              aria-current={active ? "page" : undefined}
            >
              {link.label}
              {active && (
                <span className="absolute inset-x-3 bottom-0 h-[2px] rounded-full" style={{ backgroundColor: color.hex }} />
              )}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
