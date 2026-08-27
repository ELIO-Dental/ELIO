"use client";

import { usePathname } from "next/navigation";
import { getModuleColor } from "@elio/ui";

const LINKS = [
  { href: "/pay", label: "Dashboard" },
  { href: "/pay/dentists", label: "Dentists" },
  { href: "/pay/lab-bills", label: "Lab Bills" },
  { href: "/pay/supplier-invoices", label: "Supplier Invoices" },
  { href: "/pay/bulk-payments", label: "Bulk Payments" },
  { href: "/pay/pay-periods", label: "Pay Periods" },
  { href: "/pay/reporting", label: "Reporting" },
];

const OWNER_LINKS = [{ href: "/pay/settings", label: "Settings" }];

/**
 * Module-local sub-nav — rendered inside the shared shell's own Sidebar/header chrome
 * (apps/shell owns those; see apps/pay/next.config.ts's multi-zone rewrite comment).
 * This is ElioPay's own secondary nav underneath the shell header, tinted with the
 * module's accent color per THEME_GUIDELINE.md §8.
 *
 * `isOwner` is passed down from each server-component page's own session read
 * (there is no SessionProvider/useSession wired up in this zone) — it only
 * controls link visibility. The real gate lives server-side in
 * apps/pay/app/settings/page.tsx, which never relies on this alone.
 */
export function PayNav({ isOwner = false }: { isOwner?: boolean }) {
  const pathname = usePathname();
  const color = getModuleColor("pay");
  const links = isOwner ? [...LINKS, ...OWNER_LINKS] : LINKS;

  return (
    <div className="border-b border-[--color-border]" style={{ borderTopColor: color.accentBorder, borderTopWidth: 2 }}>
      <nav className="mx-auto flex max-w-6xl gap-1 px-6">
        {links.map((link) => {
          const active = link.href === "/pay" ? pathname === "/pay" : pathname?.startsWith(link.href);
          return (
            <a
              key={link.href}
              href={link.href}
              className="relative flex h-12 items-center px-3 text-body-sm font-medium text-[--color-text-secondary] transition-colors hover:text-[--color-text-primary]"
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
