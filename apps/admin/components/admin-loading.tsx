import { Skeleton } from "@elio/ui";

/** Tenant list skeleton — banner, stats, table. */
export function TenantListLoading() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-44 w-full rounded-(--radius-xl)" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-28 rounded-(--radius-lg)" />
        <Skeleton className="h-28 rounded-(--radius-lg)" />
        <Skeleton className="h-28 rounded-(--radius-lg)" />
      </div>
      <div className="overflow-hidden rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-surface) shadow-(--shadow-sm)">
        <Skeleton className="h-20 w-full rounded-none" />
        <div className="space-y-3 p-4 sm:p-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}

/** Tenant detail skeleton — back link, actions grid, users table. */
export function TenantDetailLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-64 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-56 rounded-(--radius-lg)" />
        <Skeleton className="h-56 rounded-(--radius-lg)" />
        <Skeleton className="h-48 rounded-(--radius-lg) md:col-span-2" />
      </div>
      <Skeleton className="h-72 w-full rounded-(--radius-lg)" />
    </div>
  );
}
