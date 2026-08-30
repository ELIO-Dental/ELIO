"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "./button";
import { cn } from "../lib/cn";

export function TableRefreshButton({
  onRefresh,
  className,
  "aria-label": ariaLabel = "Refresh table",
}: {
  onRefresh?: () => void | Promise<void>;
  className?: string;
  "aria-label"?: string;
}) {
  const router = useRouter();
  const [refreshing, setRefreshing] = React.useState(false);

  async function handleClick() {
    setRefreshing(true);
    try {
      if (onRefresh) await onRefresh();
      else router.refresh();
    } finally {
      window.setTimeout(() => setRefreshing(false), 500);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className={cn("size-8 shrink-0 px-0", className)}
      onClick={handleClick}
      disabled={refreshing}
      aria-label={ariaLabel}
      data-testid="table-refresh"
    >
      <RefreshCw className={cn("size-4", refreshing && "animate-spin")} aria-hidden />
    </Button>
  );
}
