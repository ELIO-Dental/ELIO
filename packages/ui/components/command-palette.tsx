"use client";

import * as React from "react";
import { Command } from "cmdk";
import { AnimatePresence, motion } from "framer-motion";
import { Search } from "lucide-react";
import { cn } from "../lib/cn";
import { commandPaletteVariants } from "../tokens/motion";

export interface CommandPaletteItem {
  id: string;
  label: string;
  group: string;
  icon?: React.ReactNode;
  shortcut?: string;
  onSelect: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CommandPaletteItem[];
  placeholder?: string;
}

/**
 * §5.9 — Cmd+K / Ctrl+K command palette. Glass surface, fuzzy search (cmdk's
 * built-in scoring) over navigation + quick actions. Mount once in the shell
 * layout; wire the Cmd/Ctrl+K listener at the call site (see design-system demo).
 */
export function CommandPalette({ open, onOpenChange, items, placeholder = "Search or jump to..." }: CommandPaletteProps) {
  const groups = React.useMemo(() => {
    const map = new Map<string, CommandPaletteItem[]>();
    for (const item of items) {
      if (!map.has(item.group)) map.set(item.group, []);
      map.get(item.group)!.push(item);
    }
    return Array.from(map.entries());
  }, [items]);

  return (
    <AnimatePresence>
      {open && (
        <Command.Dialog
          open={open}
          onOpenChange={onOpenChange}
          label="Command palette"
          shouldFilter
          className="fixed left-1/2 top-[15%] z-(--z-index-command-palette) w-[calc(100%-32px)] max-w-xl -translate-x-1/2"
        >
          <motion.div
            variants={commandPaletteVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="overflow-hidden rounded-(--radius-xl) border shadow-(--shadow-xl)"
            style={{
              background: "var(--glass-bg)",
              borderColor: "var(--glass-border)",
              backdropFilter: "blur(var(--glass-blur))",
              WebkitBackdropFilter: "blur(var(--glass-blur))",
            }}
          >
            <div className="flex items-center gap-2 border-b border-(--color-border-subtle) px-4">
              <Search className="size-4 shrink-0 text-(--color-text-tertiary)" />
              <Command.Input
                placeholder={placeholder}
                className="h-12 w-full bg-transparent text-body text-(--color-text-primary) outline-none placeholder:text-(--color-text-tertiary)"
              />
            </div>
            <Command.List className="max-h-80 overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-body-sm text-(--color-text-secondary)">
                No results found.
              </Command.Empty>
              {groups.map(([group, groupItems]) => (
                <Command.Group
                  key={group}
                  heading={group}
                  className={cn(
                    "px-1 pb-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5",
                    "[&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-(--color-text-tertiary)"
                  )}
                >
                  {groupItems.map((item) => (
                    <Command.Item
                      key={item.id}
                      value={item.label}
                      onSelect={() => {
                        item.onSelect();
                        onOpenChange(false);
                      }}
                      className={cn(
                        "flex h-10 cursor-pointer select-none items-center gap-2 rounded-(--radius-md) px-2 text-body-sm text-(--color-text-primary)",
                        "data-[selected=true]:bg-(--color-primary-50) data-[selected=true]:text-(--color-primary-600)"
                      )}
                    >
                      {item.icon}
                      <span className="flex-1">{item.label}</span>
                      {item.shortcut && (
                        <kbd className="rounded-(--radius-sm) border border-(--color-border) px-1.5 py-0.5 text-caption text-(--color-text-tertiary)">
                          {item.shortcut}
                        </kbd>
                      )}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>
          </motion.div>
        </Command.Dialog>
      )}
    </AnimatePresence>
  );
}

/** Hook: wires the global Cmd+K / Ctrl+K listener. Returns [open, setOpen]. */
export function useCommandPaletteHotkey(): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
  return [open, setOpen];
}
