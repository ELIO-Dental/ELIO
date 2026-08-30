import { Skeleton } from "./skeleton";

/** Skeleton for portal settings pages (profile, team, support). */
export function SettingsPageLoading() {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <div className="space-y-3 border-b border-(--color-border-subtle) pb-6">
        <Skeleton className="h-9 w-48 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="mt-8 h-52 w-full rounded-(--radius-lg)" />
      <Skeleton className="mt-6 h-64 w-full rounded-(--radius-lg)" />
    </div>
  );
}
