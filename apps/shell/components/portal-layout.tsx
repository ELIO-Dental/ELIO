"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  User,
  Users,
  LifeBuoy,
  Settings,
  Plug,
  ChevronDown,
  LogOut,
} from "lucide-react";
import { signOut } from "next-auth/react";
import {
  Sidebar,
  SidebarBrand,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  useIsMobileViewport,
  Avatar,
  type SidebarNavItem,
  ThemeToggle,
} from "@elio/ui";
import { PwaSidebarInstall, getPwaConfig } from "@elio/pwa";
import type { Role } from "@elio/db";

const portalPwa = getPwaConfig("portal");

const PORTAL_NAV: Omit<SidebarNavItem, "icon">[] = [
  { id: "dashboard", label: "Dashboard", href: "/launcher" },
  { id: "profile", label: "Profile", href: "/settings/profile" },
  { id: "team", label: "Team", href: "/settings/team" },
  { id: "support", label: "Support", href: "/settings/support" },
  { id: "integrations", label: "Integrations", href: "/settings/integrations" },
  { id: "settings", label: "Settings", href: "/settings" },
];

const NAV_ICONS = {
  dashboard: LayoutDashboard,
  profile: User,
  team: Users,
  support: LifeBuoy,
  integrations: Plug,
  settings: Settings,
} as const;

function roleLabel(role: Role): string {
  switch (role) {
    case "OWNER":
      return "Owner";
    case "ADMIN":
      return "Admin";
    case "STAFF":
      return "Staff";
    default:
      return role;
  }
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

function resolveActiveId(pathname: string): string {
  if (pathname === "/launcher") return "dashboard";
  if (pathname === "/settings") return "settings";
  if (pathname.startsWith("/settings/team")) return "team";
  if (pathname.startsWith("/settings/profile")) return "profile";
  if (pathname.startsWith("/settings/support")) return "support";
  if (pathname.startsWith("/settings/integrations")) return "integrations";
  return "dashboard";
}

export interface PortalLayoutProps {
  userEmail?: string;
  role: Role;
  canViewTeam: boolean;
  children: React.ReactNode;
}

/** ELIO PORTAL chrome — sidebar with settings nav + account footer. App
 * modules are reached only via the launcher tile grid in the main area. */
export function PortalLayout({ userEmail, role, canViewTeam, children }: PortalLayoutProps) {
  const pathname = usePathname();
  const isMobile = useIsMobileViewport();
  const [userOverride, setUserOverride] = React.useState<boolean | null>(null);
  const collapsed = userOverride ?? isMobile;
  const setCollapsed = (next: boolean) => setUserOverride(next);

  const activeId = resolveActiveId(pathname);

  const navItems: SidebarNavItem[] = React.useMemo(() => {
    return PORTAL_NAV.filter((item) => item.id !== "team" || canViewTeam).map((item) => ({
      ...item,
      icon: NAV_ICONS[item.id as keyof typeof NAV_ICONS],
    }));
  }, [canViewTeam]);

  const email = userEmail ?? "";
  const displayName = email ? displayNameFromEmail(email) : "User";
  const initials = email ? initialsFromEmail(email) : "U";

  return (
    <div className="flex h-screen bg-(--color-bg)">
      <Sidebar
        items={navItems}
        activeId={activeId}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        activeModuleId="flow"
        launcher={
          <SidebarBrand
            collapsed={collapsed}
            title="ELIO Portal"
            testId="portal-brand"
            shortLabel="EP"
            logoUrl="/brand/elio-portal.png"
            collapsedLogoUrl="/icons/icon-192.png"
            logoOnly
          />
        }
        footer={
          <div className="space-y-2">
            <PwaSidebarInstall config={portalPwa} collapsed={collapsed} />
            <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex w-full items-center gap-2.5 rounded-(--radius-md) p-2 text-left transition-colors hover:bg-(--color-border-subtle)"
                data-testid="account-switcher"
              >
                <Avatar size="md" initials={initials} />
                {!collapsed && (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-sm font-medium text-(--color-text-primary)">{displayName}</span>
                    <span className="block truncate text-caption text-(--color-text-tertiary)">{roleLabel(role)}</span>
                  </span>
                )}
                {!collapsed && <ChevronDown className="size-4 shrink-0 text-(--color-text-tertiary)" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem asChild>
                <a href="/settings/profile" className="flex items-center">
                  <User className="mr-2 size-4" /> Profile
                </a>
              </DropdownMenuItem>
              {canViewTeam && (
                <DropdownMenuItem asChild data-testid="team-settings-link">
                  <a href="/settings/team" className="flex items-center">
                    <Users className="mr-2 size-4" /> Team
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <a href="/settings" className="flex items-center">
                  <Settings className="mr-2 size-4" /> Settings
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => signOut({ callbackUrl: "/login" })} data-testid="logout-button">
                <LogOut className="mr-2 size-4" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        }
      />
      <main className="relative min-w-0 flex-1 overflow-auto bg-(--color-bg-subtle)/60">
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
