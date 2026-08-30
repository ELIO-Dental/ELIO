"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronsLeft, ChevronsRight, Lock, type LucideIcon } from "lucide-react";
import { cn } from "../lib/cn";
import { duration, easing } from "../tokens/motion";
import { getModuleColor, type ModuleId } from "../lib/get-module-color";
import { useIsDark } from "../hooks/use-is-dark";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export interface SidebarNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  moduleId?: ModuleId;
}

export interface SidebarProps {
  items: SidebarNavItem[];
  activeId: string;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  activeModuleId: ModuleId;
  onNavigate?: (item: SidebarNavItem) => void;
  launcher?: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * §5.5 — collapsible left sidebar. Active item's accent bar shared-element
 * transitions between items via layoutId (slides, never pops). Active item's
 * accent tints to the CURRENT module's color, not always primary.
 */
export function Sidebar({ items, activeId, collapsed, onCollapsedChange, activeModuleId, onNavigate, launcher, footer }: SidebarProps) {
  const isDark = useIsDark();
  const moduleColor = getModuleColor(activeModuleId);

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 240 }}
      transition={{ duration: duration.base / 1000, ease: easing.out }}
      className="flex h-full flex-col border-r border-(--color-border-subtle) bg-(--color-surface)"
    >
      <div className="relative flex h-20 shrink-0 items-center border-b border-(--color-border-subtle) px-2">
        <div className="flex min-w-0 flex-1 items-center justify-center pr-9">{launcher}</div>
        <button
          onClick={() => onCollapsedChange(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-(--radius-sm) text-(--color-text-secondary) transition-colors hover:bg-(--color-border-subtle) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary-500)"
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-2">
        {items.map((item) => {
          const isActive = item.id === activeId;
          const Icon = item.icon;
          const activeBadge = isDark ? moduleColor.badgeDark : moduleColor.badgeLight;
          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={(e) => {
                if (onNavigate) {
                  e.preventDefault();
                  onNavigate(item);
                }
              }}
              className={cn(
                "relative flex h-10 items-center gap-3 rounded-(--radius-md) px-3 text-body-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary-500)",
                isActive ? "text-(--color-text-primary)" : "text-(--color-text-secondary) hover:bg-(--color-border-subtle)"
              )}
              style={isActive ? { backgroundColor: activeBadge.bg, color: activeBadge.fg } : undefined}
              aria-current={isActive ? "page" : undefined}
            >
              {isActive && (
                <motion.span
                  layoutId="sidebar-active-accent"
                  className="absolute left-0 top-1 bottom-1 w-[3px] rounded-(--radius-full)"
                  style={{ backgroundColor: moduleColor.hex }}
                  transition={easing.spring}
                />
              )}
              <Icon className="size-5 shrink-0 transition-transform duration-150 group-hover:scale-105" style={isActive ? { color: activeBadge.fg } : undefined} />
              <AnimatePresence initial={false}>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: duration.fast / 1000 }}
                    className="truncate"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          );
        })}
      </nav>

      {footer && <div className="border-t border-(--color-border) p-2">{footer}</div>}
    </motion.aside>
  );
}

export interface LauncherTile {
  moduleId: ModuleId;
  name: string;
  description: string;
  href: string;
  licensed: boolean;
}

/** §5.5 — app launcher: popover grid of module tiles, module-color icon badges,
 * greyed/desaturated + lock badge for unlicensed modules. */
export function AppLauncher({ tiles, trigger }: { tiles: LauncherTile[]; trigger: React.ReactNode }) {
  const isDark = useIsDark();

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="grid grid-cols-2 gap-2">
          {tiles.map((tile) => {
            const color = getModuleColor(tile.moduleId);
            const badge = isDark ? color.badgeDark : color.badgeLight;
            return (
              <a
                key={tile.moduleId}
                href={tile.licensed ? tile.href : undefined}
                aria-disabled={!tile.licensed}
                title={!tile.licensed ? "Contact admin to enable" : undefined}
                className={cn(
                  "relative flex flex-col gap-2 rounded-(--radius-md) border border-(--color-border-subtle) p-3 transition-colors",
                  tile.licensed ? "cursor-pointer hover:bg-(--color-bg-subtle)" : "cursor-not-allowed grayscale opacity-60"
                )}
              >
                <span
                  className="flex size-8 items-center justify-center rounded-(--radius-md) text-body-sm font-semibold"
                  style={{ backgroundColor: badge.bg, color: badge.fg }}
                >
                  {tile.name.replace("Elio", "").slice(0, 1)}
                </span>
                <span className="text-body-sm font-medium text-(--color-text-primary)">{tile.name}</span>
                <span className="text-caption text-(--color-text-tertiary)">{tile.description}</span>
                {!tile.licensed && (
                  <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-(--radius-full) bg-(--color-bg-subtle) text-(--color-text-tertiary)">
                    <Lock className="size-3" />
                  </span>
                )}
              </a>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
