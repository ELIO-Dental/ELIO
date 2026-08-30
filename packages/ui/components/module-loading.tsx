import { Skeleton } from "./skeleton";

/** Skeleton shown while a module app layout/page is loading. */
export function ModuleLoading() {
  return (
    <div className="flex h-screen bg-(--color-bg)">
      <Skeleton className="hidden h-full w-[240px] shrink-0 rounded-none lg:block" />
      <div className="flex min-w-0 flex-1 flex-col gap-8 bg-(--color-bg-subtle)/50 px-6 py-8 lg:px-10">
        <div className="space-y-3 border-b border-(--color-border-subtle) pb-6">
          <Skeleton className="h-9 w-56 max-w-full" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-28 rounded-(--radius-lg)" />
          <Skeleton className="h-28 rounded-(--radius-lg)" />
          <Skeleton className="h-28 rounded-(--radius-lg)" />
          <Skeleton className="h-28 rounded-(--radius-lg)" />
        </div>
        <Skeleton className="h-64 w-full rounded-(--radius-lg)" />
      </div>
    </div>
  );
}
