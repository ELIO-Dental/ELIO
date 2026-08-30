import { Skeleton } from "@elio/ui";

export default function PortalLoading() {
  return (
    <div className="flex h-full min-h-[60vh] flex-col gap-8 px-6 py-8 lg:px-10 lg:py-10">
      <div className="space-y-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-80 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-44 rounded-(--radius-lg)" />
        <Skeleton className="h-44 rounded-(--radius-lg)" />
        <Skeleton className="h-44 rounded-(--radius-lg)" />
      </div>
    </div>
  );
}
