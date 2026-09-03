import { FileText } from "lucide-react";
import { formatMoneyGBPOrDash } from "@elio/ui";

/** NHS period banner inside expanded payslip accordion (legacy Y2.8). */
export function NhsPeriodBanner({
  periodStart,
  periodEnd,
  udas,
  udaRatePence,
}: {
  periodStart: string;
  periodEnd: string;
  udas: string | null;
  udaRatePence: number | null;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-(--radius-md) border border-(--color-primary-500)/30 bg-(--color-primary-50) px-4 py-2"
      data-testid="nhs-period-banner"
    >
      <FileText className="size-4 shrink-0 text-(--color-primary-600)" />
      <div className="text-caption text-(--color-text-primary)">
        <span className="font-medium">NHS period: </span>
        <span>
          {periodStart} – {periodEnd}
        </span>
        {udas ? (
          <span className="ml-2 text-(--color-text-secondary)">
            ({udas} UDAs @ {formatMoneyGBPOrDash(udaRatePence)}/UDA)
          </span>
        ) : null}
      </div>
    </div>
  );
}
