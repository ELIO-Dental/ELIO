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
      className="flex items-center gap-3 rounded-(--radius-md) border border-blue-200 bg-blue-50 px-4 py-2"
      data-testid="nhs-period-banner"
    >
      <FileText className="size-4 shrink-0 text-blue-500" />
      <div className="text-caption text-blue-800">
        <span className="font-medium">NHS period: </span>
        <span>
          {periodStart} – {periodEnd}
        </span>
        {udas ? (
          <span className="ml-2 text-blue-600">
            ({udas} UDAs @ {formatMoneyGBPOrDash(udaRatePence)}/UDA)
          </span>
        ) : null}
      </div>
    </div>
  );
}
