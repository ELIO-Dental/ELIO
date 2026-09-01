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
  /** Optional practice logo beside the module title (F3.3 Flow branding). */
  brandLogoUrl?: string;
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
export function ModuleAppLayout({ brandTitle, brandLogoUrl, moduleId, navItems, userEmail, resolveActiveId: resolveActiveIdOverride, pwaAppId, children }: ModuleAppLayoutProps) {
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
            testId="module-brand"
            shortLabel={brandTitle.replace("ELIO ", "").slice(0, 2).toUpperCase()}
            logoUrl={brandLogoUrl}
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
            <div className="flex items-center gap-2.5 rounded-(--radius-md) p-2" data-testid="module-profile-footer">
              <Avatar size="md" initials={initials} />
              {!collapsed && (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-sm font-medium text-(--color-text-primary)">{displayName}</span>
                  <span className="block truncate text-caption text-(--color-text-tertiary)">{email}</span>
                </span>
              )}
            </div>
          </div>
        }
      />
      <main className="relative min-w-0 flex-1 overflow-auto bg-(--color-bg-subtle)/50">
        <div className="pointer-events-none absolute right-4 top-4 z-20 flex justify-end lg:right-6 lg:top-6">
          <div className="pointer-events-auto">
            <ThemeToggle />
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
