"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";
import { tablePageRange } from "../lib/table-pagination";

export function TablePagination({
  page,
  pageSize,
  totalCount,
  paramName = "page",
  onPageChange,
}: {
  page: number;
  pageSize: number;
  totalCount: number;
  paramName?: string;
  /** When set, pagination is client-controlled instead of URL-driven. */
  onPageChange?: (page: number) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { totalPages, safePage, from, to } = tablePageRange(page, pageSize, totalCount);

  if (totalCount <= pageSize) return null;

  function goTo(nextPage: number) {
    const clamped = Math.min(Math.max(1, nextPage), totalPages);
    if (onPageChange) {
      onPageChange(clamped);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    if (clamped <= 1) params.delete(paramName);
    else params.set(paramName, String(clamped));
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-body-sm text-(--color-text-secondary)">
        Showing {from}–{to} of {totalCount}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={safePage <= 1} onClick={() => goTo(safePage - 1)}>
          <ChevronLeft className="size-4" aria-hidden />
          Previous
        </Button>
        <span className="text-body-sm text-(--color-text-tertiary)">
          Page {safePage} of {totalPages}
        </span>
        <Button variant="secondary" size="sm" disabled={safePage >= totalPages} onClick={() => goTo(safePage + 1)}>
          Next
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
