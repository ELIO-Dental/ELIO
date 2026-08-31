import { Skeleton } from "@elio/ui";

/** Auth route skeleton — Super Admin login. */
export function AuthLoading() {
  return (
    <div className="flex min-h-screen bg-(--color-bg)">
      <Skeleton className="hidden w-[44%] rounded-none lg:block" />
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-[440px] space-y-6">
          <div className="space-y-3 text-center lg:text-left">
            <Skeleton className="mx-auto h-9 w-56 lg:mx-0" />
            <Skeleton className="mx-auto h-4 w-72 lg:mx-0" />
          </div>
          <Skeleton className="h-80 w-full rounded-(--radius-lg)" />
        </div>
      </div>
    </div>
  );
}
