"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input, Badge, Button } from "@elio/ui";

const STATUS_OPTIONS = ["INVITED", "SIGNED", "ACTIVE", "PAUSED", "CANCELLED"] as const;

/**
 * THEME_GUIDELINE.md §5.16 filter bar — search input (300ms debounce) +
 * removable status-filter pills, sitting above the Patients table. Filter
 * state lives in the URL (searchParams) so the server component page can
 * apply it directly to the Prisma query.
 */
export function FilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const status = searchParams.get("status") ?? "";
  const [value, setValue] = React.useState(q);

  React.useEffect(() => {
    const handle = setTimeout(() => {
      if (value === q) return;
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set("q", value);
      else params.delete("q");
      router.push(`${pathname}?${params.toString()}`);
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function setStatus(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("status", next);
    else params.delete("status");
    router.push(`${pathname}?${params.toString()}`);
  }

  const hasFilters = Boolean(q || status);

  return (
    <div className="rounded-t-[--radius-lg] border border-b-0 border-[--color-border] bg-[--color-surface] px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[--color-text-tertiary]" />
          <Input
            placeholder="Search patients…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_OPTIONS.map((s) => (
            <button key={s} type="button" onClick={() => setStatus(status === s ? "" : s)}>
              <Badge variant={status === s ? "primary" : "neutral"}>{s}</Badge>
            </button>
          ))}
        </div>

        {status && (
          <Badge variant="primary">
            status: {status}
            <button type="button" onClick={() => setStatus("")} aria-label="Clear status filter">
              <X className="size-3" />
            </button>
          </Badge>
        )}

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setValue("");
              router.push(pathname);
            }}
          >
            Clear all
          </Button>
        )}
      </div>
    </div>
  );
}
