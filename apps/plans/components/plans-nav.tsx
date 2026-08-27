"use client";

import { usePathname } from "next/navigation";
import { getModuleColor } from "@elio/ui";

const LINKS = [
  { href: "/plans/dashboard", label: "Dashboard" },
  { href: "/plans/patients", label: "Patients" },
  { href: "/plans/plans", label: "Plans" },
  { href: "/plans/payments", label: "Payments" },
  { href: "/plans/reconciliation", label: "Reconciliation" },
  { href: "/plans/redeems", label: "Redeems" },
  { href: "/plans/reports", label: "Reports" },
  { href: "/plans/documents", label: "Documents" },
  { href: "/plans/action-required", label: "Action Required" },
  { href: "/plans/audit-log", label: "Audit Log" },
  { href: "/plans/users", label: "Users" },
  { href: "/plans/settings", label: "Settings" },
];

/**
 * Module-local sub-nav — mirrors apps/pay/components/pay-nav.tsx's pattern.
 * All 12 MASTER_BUILD_GUIDE.md §1.7 screens are real links.
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
