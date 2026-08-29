"use client";

// Local copy of apps/shell's ShellLayout, adapted for this zone — mirrors
// apps/pay/components/shell-layout.tsx exactly (see its own header comment
// for why each module app renders its own copy instead of importing across
// zones). Found live (2026-08-28, independent Phase 1 audit): apps/flow
// never rendered this at all — only apps/pay had it — so ElioFlow was
// missing the shared cross-module sidebar/header chrome entirely, not just
// visually inconsistent with apps/pay.
import * as React from "react";
import { LayoutGrid, Wallet, HeartHandshake, ClipboardList, ChevronDown, LogOut, Settings, User as UserIcon } from "lucide-react";
import { signOut } from "next-auth/react";
import {
  Sidebar,
  AppLauncher,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  useIsMobileViewport,
  CommandPalette,
  useCommandPaletteHotkey,
  type SidebarNavItem,
  type CommandPaletteItem,
  type ModuleId,
} from "@elio/ui";

const NAV_ITEMS: SidebarNavItem[] = [
  { id: "launcher", label: "Launcher", icon: LayoutGrid, href: "/launcher" },
  { id: "pay", label: "ElioPay", icon: Wallet, href: "/pay", moduleId: "pay" },
  { id: "plans", label: "ElioPlans", icon: HeartHandshake, href: "/plans", moduleId: "plans" },
  { id: "flow", label: "ElioFlow", icon: ClipboardList, href: "/flow", moduleId: "flow" },
];

const LAUNCHER_TILES = [
  { moduleId: "pay" as ModuleId, name: "ElioPay", description: "Run payroll & pay periods", href: "/pay", licensed: true },
  { moduleId: "plans" as ModuleId, name: "ElioPlans", description: "Patient membership plans", href: "/plans", licensed: true },
  { moduleId: "flow" as ModuleId, name: "ElioFlow", description: "Practice workflow & scheduling", href: "/flow", licensed: true },
];

export interface ShellLayoutProps {
  activeId?: string;
  practiceName?: string;
  userEmail?: string;
  isOwner?: boolean;
  children: React.ReactNode;
}

/** ElioFlow's copy of the shared shell layout — sidebar/header persist,
 * module content renders inside `children`. See MASTER_BUILD_GUIDE.md Step 1.8. */
export function ShellLayout({ activeId = "flow", practiceName, userEmail, isOwner, children }: ShellLayoutProps) {
  // F.2 Final QA (2026-08-29): see packages/ui/lib/use-is-mobile-viewport.ts's
  // comment — defaults collapsed on a mobile-width viewport, still fully
  // user-togglable via the Sidebar's own collapse button.
  //
  // F.4 Final QA (2026-08-29): see apps/shell/components/shell-layout.tsx's
  // identical comment — avoids a real eslint(react-hooks/set-state-in-effect)
  // violation the original useEffect version had.
  const isMobile = useIsMobileViewport();
  const [userOverride, setUserOverride] = React.useState<boolean | null>(null);
  const collapsed = userOverride ?? isMobile;
  const setCollapsed = (next: boolean) => setUserOverride(next);

  // F.5 Final QA (2026-08-29): see apps/pay/components/shell-layout.tsx's
  // identical comment — wires APPLICATION_FLOW.md §3a's command palette,
  // which existed as a component but was never mounted anywhere real.
  const [paletteOpen, setPaletteOpen] = useCommandPaletteHotkey();
  const paletteItems = React.useMemo<CommandPaletteItem[]>(
    () =>
      NAV_ITEMS.map((item) => ({
        id: item.id,
        label: item.label,
        group: "Navigate",
        icon: item.icon ? <item.icon className="size-4" /> : undefined,
        onSelect: () => {
          window.location.href = item.href;
        },
      })),
    [],
  );

  return (
    <div className="flex h-screen bg-(--color-bg)">
      <Sidebar
        items={NAV_ITEMS}
        activeId={activeId}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        activeModuleId="flow"
        launcher={
          <AppLauncher
            tiles={LAUNCHER_TILES}
            trigger={
              <button className="flex size-8 items-center justify-center rounded-(--radius-md) hover:bg-(--color-border-subtle)" aria-label="Open app launcher">
                <LayoutGrid className="size-5 text-(--color-text-secondary)" />
              </button>
            }
          />
        }
        footer={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-2 rounded-(--radius-md) p-2 text-left hover:bg-(--color-border-subtle)" data-testid="account-switcher">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-(--color-primary-100) text-body-sm font-semibold text-(--color-primary-700)">
                  {(userEmail ?? "U").slice(0, 1).toUpperCase()}
                </span>
                {!collapsed && (
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-sm font-medium text-(--color-text-primary)">
                      {practiceName ?? "Practice"}
                    </span>
                    <span className="block truncate text-caption text-(--color-text-tertiary)">{userEmail}</span>
                  </span>
                )}
                {!collapsed && <ChevronDown className="size-4 shrink-0 text-(--color-text-tertiary)" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem>
                <UserIcon className="mr-2 size-4" /> Profile
              </DropdownMenuItem>
              {isOwner && (
                <DropdownMenuItem asChild data-testid="team-settings-link">
                  <a href="/settings/team" className="flex items-center">
                    <Settings className="mr-2 size-4" /> Team
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => signOut({ callbackUrl: "/login" })} data-testid="logout-button">
                <LogOut className="mr-2 size-4" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center border-b border-(--color-border) px-6">
          <span className="text-body-sm font-medium text-(--color-text-secondary)">ELIO — ElioFlow</span>
        </header>
        <main className="min-w-0 flex-1 overflow-auto">{children}</main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} items={paletteItems} />
    </div>
  );
}
