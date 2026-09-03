"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "../lib/cn";
import { listStaggerContainer, listStaggerItem } from "../tokens/motion";

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full min-w-[560px] border-collapse text-body-sm", className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("sticky top-0 z-[1] bg-(--color-bg-subtle)", className)} {...props} />;
}

export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "h-11 px-4 text-center text-caption font-semibold uppercase tracking-wide text-(--color-text-secondary)",
        className
      )}
      {...props}
    />
  );
}

/** Wraps <tbody> with a staggered fade+slide entrance for rows (§5.4). */
export function TableBody({ className, children, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <motion.tbody
      variants={listStaggerContainer}
      initial="initial"
      animate="animate"
      className={cn(className)}
      {...(props as React.ComponentProps<typeof motion.tbody>)}
    >
      {children}
    </motion.tbody>
  );
}

export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <motion.tr
      variants={listStaggerItem}
      className={cn(
        "h-12 border-b border-(--color-border-subtle) transition-colors duration-100 hover:bg-(--color-bg-subtle)",
        className
      )}
      {...(props as React.ComponentProps<typeof motion.tr>)}
    />
  );
}

export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("px-4 text-center text-(--color-text-primary)", className)} {...props} />;
}

/** Mono + tabular-nums for money — right-aligned; pair with TableHead className="text-right". */
export function TableCellMoney({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn("tabular-nums px-4 text-right font-(--font-mono) text-(--color-text-primary)", className)}
      {...props}
    />
  );
}
