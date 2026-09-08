import { CalendarClock } from "lucide-react";
import { PlansSection } from "@/components/plans-page-chrome";

/** Static DD collection schedule reminder (P3.5). */
export function PaymentScheduleCard() {
  return (
    <PlansSection title="Collection schedule" subtitle="Direct Debit timing for memberships">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-primary-50) text-(--color-primary-600)">
            <CalendarClock className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-body-sm font-semibold text-(--color-text-primary)">Next collection date</p>
            <p className="mt-1 text-body-sm text-(--color-text-secondary)">
              Collections run on the 1st of each month. Failed payments retry on the 11th.
            </p>
          </div>
        </div>
        <div className="rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-bg-subtle)/40 px-4 py-3 text-center">
          <p className="font-(--font-mono) text-h2 font-semibold tabular-nums text-(--color-text-primary)">1st</p>
          <p className="text-caption text-(--color-text-tertiary)">of next month</p>
        </div>
      </div>
    </PlansSection>
  );
}
