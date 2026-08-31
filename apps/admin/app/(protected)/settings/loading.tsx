import { Skeleton } from "@elio/ui";

export default function SettingsLoading() {
  return (
    <div className="space-y-8">
      <div className="space-y-3 border-b border-(--color-border-subtle) pb-6">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-(--radius-lg)" />
        <Skeleton className="h-72 rounded-(--radius-lg)" />
      </div>
    </div>
  );
}
