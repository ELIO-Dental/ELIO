"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Building2, ChevronDown, LogOut, Settings, Shield } from "lucide-react";
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
  ThemeToggle,
  type SidebarNavItem,
} from "@elio/ui";
import { PwaInstallButton, PwaSidebarInstall, getPwaConfig } from "@elio/pwa";

const pwa = getPwaConfig("admin");

const NAV_ITEMS: SidebarNavItem[] = [
  { id: "tenants", label: "Tenants", icon: Building2, href: "/" },
  { id: "settings", label: "Settings", icon: Settings, href: "/settings" },
];

function initialsFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "A";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function AdminNav({ userEmail, children }: { userEmail?: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobileViewport();
  const [collapsed, setCollapsed] = React.useState(false);

  const activeId = pathname.startsWith("/settings")
    ? "settings"
    : pathname.startsWith("/tenants") || pathname === "/"
      ? "tenants"
      : "tenants";
  const email = userEmail ?? "admin@elio.dev";
  const displayName = displayNameFromEmail(email);

  return (
    <div className="flex min-h-screen bg-(--color-bg-subtle)">
      <div className="sticky top-0 hidden h-screen shrink-0 md:block">
        <Sidebar
          items={NAV_ITEMS}
          activeId={activeId}
          collapsed={collapsed}
          onCollapsedChange={setCollapsed}
          activeModuleId="pay"
          launcher={<SidebarBrand title="ELIO ADMIN" collapsed={collapsed} shortLabel="SA" showLogo />}
          footer={
            <div className="space-y-2 border-t border-(--color-border-subtle) p-2">
              <div className="flex items-center justify-center px-1 py-1">
                <ThemeToggle />
              </div>
              <PwaSidebarInstall config={pwa} collapsed={collapsed} />
            </div>
          }
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-[1100] flex h-14 shrink-0 items-center justify-between gap-4 border-b border-(--color-border-subtle) bg-(--color-surface)/95 px-4 shadow-(--shadow-xs) backdrop-blur-sm sm:px-6">
          <div className="flex min-w-0 items-center gap-3 md:hidden">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-primary-50) text-(--color-primary-fg)">
              <Shield className="size-4" aria-hidden />
            </span>
            <span className="truncate text-body-sm font-bold tracking-wide text-(--color-text-primary)">ELIO ADMIN</span>
          </div>

          <div className="hidden md:block">
            <p className="text-caption font-medium uppercase tracking-wide text-(--color-text-tertiary)">Platform</p>
            <p className="text-body-sm font-semibold text-(--color-text-primary)">Super Admin Console</p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="md:hidden">
              <ThemeToggle />
            </div>
            <div className="hidden sm:block">
              <PwaInstallButton config={pwa} variant="outline" size="sm" />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex max-w-[min(100%,14rem)] items-center gap-2 rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-surface) px-2 py-1.5 shadow-(--shadow-xs) transition-colors hover:bg-(--color-bg-subtle)"
                  data-testid="admin-user-menu"
                >
                  <Avatar size="sm" initials={initialsFromEmail(email)} />
                  <span className="hidden truncate text-left sm:block">
                    <span className="block truncate text-body-sm font-medium text-(--color-text-primary)">{displayName}</span>
                    <span className="block truncate text-caption text-(--color-text-tertiary)">Super Admin</span>
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-(--color-text-tertiary)" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem disabled className="text-caption text-(--color-text-tertiary)">
                  {email}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/settings")}>
                  <Settings className="size-4" aria-hidden />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>
                  <LogOut className="size-4" aria-hidden />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 pb-24 sm:px-6 sm:py-8 md:pb-8 lg:px-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>

      {isMobile && (
        <nav className="fixed inset-x-0 bottom-0 z-[1100] flex border-t border-(--color-border-subtle) bg-(--color-surface) px-2 py-2 md:hidden">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeId;
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex flex-1 flex-col items-center gap-1 rounded-(--radius-md) px-2 py-2 text-caption font-medium ${
                  active ? "text-(--color-primary-fg)" : "text-(--color-text-secondary)"
                }`}
              >
                <Icon className="size-5" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
