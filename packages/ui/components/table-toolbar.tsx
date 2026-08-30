import * as React from "react";
import { cn } from "../lib/cn";
import { TableRefreshButton } from "./table-refresh-button";

/** Toolbar row for TablePanel — optional left content plus a refresh control on the right. */
export function TableToolbar({
  children,
  onRefresh,
  title,
  className,
}: {
  children?: React.ReactNode;
  onRefresh?: () => void | Promise<void>;
  title?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        {title ? <span className="text-body-sm font-semibold text-(--color-text-primary)">{title}</span> : null}
        {children}
      </div>
      <TableRefreshButton onRefresh={onRefresh} />
    </div>
  );
}
