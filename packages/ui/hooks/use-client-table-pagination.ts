"use client";

import * as React from "react";
import { DEFAULT_TABLE_PAGE_SIZE } from "../lib/table-pagination";

export function useClientTablePagination<T>(
  items: T[],
  pageSize = DEFAULT_TABLE_PAGE_SIZE,
  resetDeps: React.DependencyList = []
) {
  const [page, setPage] = React.useState(1);
  const totalCount = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  React.useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller passes explicit reset keys (filters, etc.)
  }, [items.length, ...resetDeps]);

  React.useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const paginatedItems = React.useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize]
  );

  return {
    page: safePage,
    pageSize,
    totalCount,
    items: paginatedItems,
    setPage,
    showPagination: totalCount > pageSize,
  };
}
