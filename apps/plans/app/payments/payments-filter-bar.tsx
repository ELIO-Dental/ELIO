"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Badge, Button } from "@elio/ui";
import { X } from "lucide-react";

const STATUS_OPTIONS = ["PENDING", "CONFIRMED", "PAID_OUT", "FAILED", "CANCELLED", "CHARGED_BACK"] as const;

/** THEME_GUIDELINE.md §5.16 filter bar — status pills only (no free-text search
 * field for Payments, matching ElioPlans' original screen). Filter state lives
 * in the URL so the server component page applies it directly to Prisma. */
export function PaymentsFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const status = searchParams.get("status") ?? "";

  function setStatus(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("status", next);
    else params.delete("status");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="rounded-t-(--radius-lg) border border-b-0 border-(--color-border) bg-(--color-surface) px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
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

        {status && (
          <Button variant="ghost" size="sm" onClick={() => router.push(pathname)}>
            Clear all
          </Button>
        )}
      </div>
    </div>
  );
}
