"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { type LucideIcon, Inbox } from "lucide-react";
import { Button } from "./button";
import { emptyStateVariants } from "../tokens/motion";
import { cn } from "../lib/cn";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

/** §5.10 — designed empty state: icon, one-line explanation, optional primary CTA. */
export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: EmptyStateProps) {
  return (
    <motion.div
      variants={emptyStateVariants}
      initial="initial"
      animate="animate"
      className={cn("flex flex-col items-center justify-center gap-3 rounded-(--radius-lg) border border-dashed border-(--color-border) px-6 py-16 text-center", className)}
    >
      <div className="flex size-12 items-center justify-center rounded-(--radius-full) bg-(--color-bg-subtle) text-(--color-text-tertiary)">
        <Icon className="size-6" strokeWidth={1.75} />
      </div>
      <p className="text-h3 text-(--color-text-primary)">{title}</p>
      {description && <p className="max-w-sm text-body-sm text-(--color-text-secondary)">{description}</p>}
      {action && (
        <Button variant="primary" size="sm" onClick={action.onClick} className="mt-2">
          {action.label}
        </Button>
      )}
    </motion.div>
  );
}
