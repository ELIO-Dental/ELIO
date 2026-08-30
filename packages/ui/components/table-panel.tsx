import * as React from "react";
import { cn } from "../lib/cn";

/** Bordered surface for list tables — optional toolbar row (filters, actions) and footer (pagination). UI only. */
export function TablePanel({
  children,
  toolbar,
  footer,
  className,
  contentClassName,
}: {
  children: React.ReactNode;
  toolbar?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div className={cn("overflow-hidden rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) shadow-(--shadow-xs)", className)}>
      {toolbar ? (
        <div className="border-b border-(--color-border-subtle) bg-(--color-bg-subtle)/70 px-4 py-3">{toolbar}</div>
      ) : null}
      <div className={contentClassName}>{children}</div>
      {footer ? (
        <div className="border-t border-(--color-border-subtle) bg-(--color-bg-subtle)/50 px-4 py-3">{footer}</div>
      ) : null}
    </div>
  );
}
