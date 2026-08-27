"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../lib/cn";
import { dropdownVariants } from "../tokens/motion";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

/** THEME_GUIDELINE.md §5.5 — explanatory tooltip for a greyed-out, unlicensed
 * launcher tile (and any other future disabled-with-explanation control). */
export function TooltipContent({ children, className, ...props }: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <AnimatePresence>
        <TooltipPrimitive.Content sideOffset={6} asChild {...props}>
          <motion.div
            variants={dropdownVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className={cn(
              "z-[1400] rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-surface-raised) px-3 py-1.5 text-caption text-(--color-text-primary) shadow-(--shadow-md)",
              className
            )}
          >
            {children}
          </motion.div>
        </TooltipPrimitive.Content>
      </AnimatePresence>
    </TooltipPrimitive.Portal>
  );
}
