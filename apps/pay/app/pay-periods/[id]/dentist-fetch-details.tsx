import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableCellMoney,
  TableHead,
  TableHeader,
  TablePanel,
  TableRow,
  formatMoneyGBPOrDash,
} from "@elio/ui";

interface Analytics {
  totalChairMins?: number;
  totalPatients?: number;
  grossPerHour?: number;
  netPerHour?: number;
  avgAppointmentMins?: number;
  utilizationPercent?: number;
}

interface PatientLine {
  id: string;
  patientName: string | null;
  invoiceDate: string | null;
  amountPence: number;
  amountPaidPence: number | null;
  amountOutstandingPence: number | null;
  paymentStatus: string | null;
  durationMins: number | null;
  hourlyRatePence: number | null;
  isFinance: boolean;
  flagged: boolean;
  treatmentDescription: string | null;
}

export function DentistFetchDetails({
  analytics,
  therapyMinutes,
  lines,
}: {
  analytics: Analytics | null;
  therapyMinutes: number | null;
  lines: PatientLine[];
}) {
  if (!analytics && lines.length === 0 && therapyMinutes == null) return null;

  return (
    <div className="mt-4 space-y-4 border-t border-(--color-border-subtle) px-6 pb-6 pt-4">
      {(analytics || therapyMinutes != null) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {analytics?.totalPatients != null && (
            <Metric label="Patients" value={String(analytics.totalPatients)} />
          )}
          {analytics?.totalChairMins != null && (
            <Metric label="Chair mins" value={String(analytics.totalChairMins)} />
          )}
          {analytics?.grossPerHour != null && (
            <Metric label="Gross £/hr" value={`£${analytics.grossPerHour}`} />
          )}
          {analytics?.netPerHour != null && (
            <Metric label="Net £/hr" value={`£${analytics.netPerHour}`} />
          )}
          {analytics?.utilizationPercent != null && (
            <Metric label="Utilisation" value={`${analytics.utilizationPercent}%`} />
          )}
          {therapyMinutes != null && therapyMinutes > 0 && (
            <Metric label="Therapy mins" value={String(therapyMinutes)} />
          )}
        </div>
      )}

      {lines.length > 0 && (
        <div>
          <h3 className="mb-2 text-body-sm font-semibold text-(--color-text-primary)">Private patients</h3>
          <div className="overflow-x-auto rounded-(--radius-md) border border-(--color-border-subtle)">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Mins</TableHead>
                  <TableHead className="text-right">£/hr</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Finance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>
                      <div className="font-medium">{line.patientName ?? "—"}</div>
                      {line.treatmentDescription ? (
                        <div className="text-caption text-(--color-text-tertiary)">{line.treatmentDescription}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>{line.invoiceDate ?? "—"}</TableCell>
                    <TableCellMoney>{formatMoneyGBPOrDash(line.amountPence)}</TableCellMoney>
                    <TableCellMoney>{line.durationMins ?? "—"}</TableCellMoney>
                    <TableCellMoney>
                      {line.hourlyRatePence != null ? formatMoneyGBPOrDash(line.hourlyRatePence) : "—"}
                    </TableCellMoney>
                    <TableCell>
                      <Badge
                        variant={
                          line.paymentStatus === "paid"
                            ? "success"
                            : line.paymentStatus === "partial"
                              ? "warning"
                              : line.flagged
                                ? "danger"
                                : "neutral"
                        }
                      >
                        {line.paymentStatus ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>{line.isFinance ? "Yes" : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-bg-subtle) px-3 py-2">
      <p className="text-caption text-(--color-text-tertiary)">{label}</p>
      <p className="mt-1 text-body font-semibold tabular-nums text-(--color-text-primary)">{value}</p>
    </div>
  );
}
