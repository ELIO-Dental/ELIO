"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { Sidebar, type SidebarNavItem } from "./sidebar";
import { SidebarBrand } from "./sidebar-brand";
import { Avatar } from "./avatar";
import { ThemeToggle } from "./theme-toggle";
import { useIsMobileViewport } from "../lib/use-is-mobile-viewport";
import type { ModuleId } from "../lib/get-module-color";
import { resolveModuleBrandLogos, type BrandModuleId } from "../lib/resolve-module-brand-logos";
import { PwaSidebarInstall, getPwaConfig, type PwaAppId } from "@elio/pwa";

export interface ModuleNavLink {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** When true, active only on an exact pathname match (e.g. zone dashboard root "/"). */
  exact?: boolean;
}

export interface ModuleAppLayoutProps {
  brandTitle: string;
  /**
   * Practice-uploaded logo URL. When empty, the ELIO product wordmark is used
   * (elio pay / plans / flow) — never legacy ElioPay/ElioPlans/ElioFlow icons.
   */
  brandLogoUrl?: string;
  /** Optional clinic name under the brand mark. */
  brandSubtitle?: string;
  moduleId: ModuleId;
  navItems: ModuleNavLink[];
  userEmail?: string;
  /** Optional override for nested routes not listed in navItems (e.g. /flow/consults/[id]). */
  resolveActiveId?: (pathname: string, defaultId: string) => string;
  /** When set, shows a desktop PWA install action in the sidebar footer. */
  pwaAppId?: PwaAppId;
  children: React.ReactNode;
}

function resolveActiveId(pathname: string, links: ModuleNavLink[]): string {
  const sorted = [...links].sort((a, b) => b.href.length - a.href.length);
  for (const link of sorted) {
    const active =
      link.exact === true
        ? pathname === link.href
        : pathname === link.href || pathname.startsWith(`${link.href}/`);
    if (active) return link.id;
  }
  return links[0]?.id ?? "";
}

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function initialsFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "U";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

/** App-module chrome — sidebar with page tabs, ELIO Portal back link, profile-only footer. */
export function ModuleAppLayout({ brandTitle, brandLogoUrl, brandSubtitle, moduleId, navItems, userEmail, resolveActiveId: resolveActiveIdOverride, pwaAppId, children }: ModuleAppLayoutProps) {
  const pathname = usePathname() ?? "";
  const isMobile = useIsMobileViewport();
  const [userOverride, setUserOverride] = React.useState<boolean | null>(null);
  const collapsed = userOverride ?? isMobile;
  const setCollapsed = (next: boolean) => setUserOverride(next);

  const activeId = resolveActiveIdOverride?.(pathname, resolveActiveId(pathname, navItems)) ?? resolveActiveId(pathname, navItems);

  const sidebarItems: SidebarNavItem[] = navItems.map((item) => ({
    id: item.id,
    label: item.label,
    href: item.href,
    icon: item.icon,
    moduleId,
  }));

  const email = userEmail ?? "";
  const displayName = email ? displayNameFromEmail(email) : "User";
  const initials = email ? initialsFromEmail(email) : "U";
  const pwaConfig = pwaAppId ? getPwaConfig(pwaAppId) : null;
  const brand =
    moduleId === "pay" || moduleId === "plans" || moduleId === "flow"
      ? resolveModuleBrandLogos(moduleId as BrandModuleId, brandLogoUrl)
      : {
          logoUrl: brandLogoUrl?.trim() || undefined,
          logoDarkUrl: undefined as string | undefined,
          collapsedLogoUrl: undefined as string | undefined,
          logoOnly: Boolean(brandLogoUrl?.trim()),
          usingCustom: Boolean(brandLogoUrl?.trim()),
        };

  return (
    <div className="flex h-screen bg-(--color-bg)">
      <Sidebar
        items={sidebarItems}
        activeId={activeId}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        activeModuleId={moduleId}
        launcher={
          <SidebarBrand
            collapsed={collapsed}
            title={brandTitle}
            subtitle={brandSubtitle}
            testId="module-brand"
            shortLabel={brandTitle.replace("ELIO ", "").slice(0, 2).toUpperCase()}
            logoUrl={brand.logoUrl}
            logoDarkUrl={brand.logoDarkUrl}
            collapsedLogoUrl={brand.collapsedLogoUrl}
            logoOnly={brand.logoOnly}
            logoSize="lg"
          />
        }
        footer={
          <div className="space-y-2">
            <a
              href="/launcher"
              className="flex h-10 items-center gap-3 rounded-(--radius-md) px-3 text-body-sm font-medium text-(--color-text-secondary) transition-colors hover:bg-(--color-border-subtle) hover:text-(--color-text-primary)"
              data-testid="back-to-portal"
            >
              <ArrowLeft className="size-4 shrink-0" />
              {!collapsed && <span className="truncate">ELIO Portal</span>}
            </a>
            {pwaConfig && <PwaSidebarInstall config={pwaConfig} collapsed={collapsed} />}
            {/* Theme toggle lives in the sidebar — an absolute chip over <main> sat on top of PageHeader CTAs (Plans dashboard). */}
            {collapsed ? (
              <div className="flex flex-col items-center gap-2" data-testid="module-profile-footer">
                <ThemeToggle />
                <Avatar size="md" initials={initials} />
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-(--radius-md) p-2" data-testid="module-profile-footer">
                <Avatar size="md" initials={initials} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-sm font-medium text-(--color-text-primary)">{displayName}</span>
                  <span className="block truncate text-caption text-(--color-text-tertiary)">{email}</span>
                </span>
                <ThemeToggle />
              </div>
            )}
          </div>
        }
      />
      <main className="relative min-w-0 flex-1 overflow-auto bg-(--color-bg-subtle)/50">{children}</main>
    </div>
  );
}
