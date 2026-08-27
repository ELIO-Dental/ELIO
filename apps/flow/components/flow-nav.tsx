"use client";

import { usePathname } from "next/navigation";
import { getModuleColor } from "@elio/ui";

const LINKS = [
  { href: "/flow/pipeline", label: "Pipeline" },
  { href: "/flow/reporting", label: "Reporting" },
  { href: "/flow/enquiries", label: "Enquiries" },
  { href: "/flow/reminders", label: "Reminders" },
];

/**
 * Module-local sub-nav — mirrors apps/plans/components/plans-nav.tsx's
 * pattern. All four screens are real (Enquiries/Reminders added in this
 * pass — capture no longer only happens inline from the pipeline board).
 */
export function FlowNav() {
  const pathname = usePathname();
  const color = getModuleColor("flow");

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
