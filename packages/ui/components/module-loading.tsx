import { Skeleton } from "./skeleton";

/** Page-content skeleton while a route segment loads inside an existing module layout. */
export function ModuleLoading() {
  return (
    <div className="flex min-h-[60vh] flex-col gap-8 px-6 py-8 lg:px-10 lg:py-10">
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
  );
}
